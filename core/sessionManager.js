const { AsyncLocalStorage } = require('async_hooks');
const EventEmitter = require('events');
const { Message } = require('discord.js');
const stats = require('./statsManager.js');

const storage = new AsyncLocalStorage();
const sessions = new Map();
let patched = false;
const nativeSetTimeout = global.setTimeout;
const nativeSetInterval = global.setInterval;
const nativeClearTimeout = global.clearTimeout;
const nativeClearInterval = global.clearInterval;

function current() {
  return storage.getStore();
}

function patchRuntime() {
  if (patched) return;
  patched = true;

  global.setTimeout = function trackedSetTimeout(fn, delay, ...args) {
    const session = current();
    const timer = nativeSetTimeout(function (...inner) {
      if (session) session.timers.delete(timer);
      return fn(...inner);
    }, delay, ...args);
    if (session) session.timers.add(timer);
    return timer;
  };

  global.setInterval = function trackedSetInterval(fn, delay, ...args) {
    const session = current();
    const timer = nativeSetInterval(fn, delay, ...args);
    if (session) session.intervals.add(timer);
    return timer;
  };

  const originalCollector = Message.prototype.createMessageComponentCollector;
  if (originalCollector) {
    Message.prototype.createMessageComponentCollector = function patchedCollector(...args) {
      const collector = originalCollector.apply(this, args);
      const session = current();
      if (session) registerCollector(session, collector);
      return collector;
    };
  }

  const originalOn = EventEmitter.prototype.on;
  EventEmitter.prototype.on = function patchedOn(event, listener) {
    if (event === 'collect' && this?.constructor?.name?.includes('Collector')) {
      const session = current();
      if (session) {
        return originalOn.call(this, event, async function wrappedCollect(interaction, ...args) {
          trackInteraction(session, interaction);
          return listener.call(this, interaction, ...args);
        });
      }
    }
    if (event === 'end' && this?.constructor?.name?.includes('Collector')) {
      const session = current();
      if (session) {
        return originalOn.call(this, event, function wrappedEnd(...args) {
          session.collectors.delete(this);
          return listener.call(this, ...args);
        });
      }
    }
    return originalOn.call(this, event, listener);
  };
}

function trackInteraction(session, interaction) {
  if (!interaction?.user?.id) return;
  if (interaction.customId === 'join' || interaction.customId?.endsWith(':join')) {
    session.participants.add(interaction.user.id);
  }
  if (interaction.customId === 'exit' || interaction.customId?.endsWith(':exit')) {
    session.participants.delete(interaction.user.id);
  }
}

function registerCollector(session, collector) {
  session.collectors.add(collector);
}

function registerParticipant(userId) {
  const session = current();
  if (session && userId) session.participants.add(userId);
}

function registerWinner(userId) {
  const session = current();
  if (session && userId) {
    session.participants.add(userId);
    session.winners.add(userId);
  }
}

function createSession(channelId, gameName, options = {}) {
  const session = {
    channelId,
    gameName,
    type: options.type || 'group',
    ownerId: options.ownerId,
    collectors: new Set(),
    timers: new Set(),
    intervals: new Set(),
    loops: new Set(),
    participants: new Set(),
    winners: new Set(),
    cleanup: new Set(),
    stopped: false,
    finalized: false,
    startedAt: Date.now(),
  };
  sessions.set(channelId, session);
  return session;
}

async function finalize(session) {
  if (!session || session.finalized) return;
  session.finalized = true;
  await stats.finalizeGame({
    gameName: session.gameName,
    type: session.type,
    participants: [...session.participants],
    winners: [...session.winners],
  }).catch((error) => console.error('[Stats] finalize failed:', error));
}

async function run(channelId, gameName, fn, options = {}) {
  patchRuntime();
  const session = createSession(channelId, gameName, options);
  return storage.run(session, fn);
}

async function end(channelId) {
  const session = sessions.get(channelId);
  if (!session) return false;
  await finalize(session);
  sessions.delete(channelId);
  return true;
}

async function stop(channelId, reason = 'manual') {
  const session = sessions.get(channelId);
  if (!session) return null;
  session.stopped = true;

  for (const collector of session.collectors) {
    try { collector.removeAllListeners('collect'); collector.removeAllListeners('end'); } catch (_) {}
    try { collector.stop(reason); } catch (_) {}
  }
  session.collectors.clear();

  for (const timer of session.timers) nativeClearTimeout(timer);
  session.timers.clear();

  for (const interval of session.intervals) nativeClearInterval(interval);
  session.intervals.clear();

  for (const loop of session.loops) {
    try { if (typeof loop.stop === 'function') loop.stop(reason); } catch (_) {}
    try { if (typeof loop.cancel === 'function') loop.cancel(reason); } catch (_) {}
  }
  session.loops.clear();

  for (const cleanup of session.cleanup) {
    try { await cleanup(reason); } catch (error) { console.error('[Session cleanup] failed:', error); }
  }
  session.cleanup.clear();

  await finalize(session);
  sessions.delete(channelId);
  return session;
}

function has(channelId) { return sessions.has(channelId); }
function get(channelId) { return sessions.get(channelId); }
function list() { return [...sessions.values()]; }
function onCleanup(fn) { const session = current(); if (session && typeof fn === 'function') session.cleanup.add(fn); }
function registerLoop(loop) { const session = current(); if (session) session.loops.add(loop); }

module.exports = { patchRuntime, run, end, stop, has, get, list, current, registerCollector, registerParticipant, registerWinner, onCleanup, registerLoop };
