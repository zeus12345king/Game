module.exports = {

  // الإعدادات الأساسية 

  prefix: '+',

  // أيدي أونراتالبوت (يملكون كل الصلاحيات)
  owners: [
    '656783724662226963',
  ],

  // رولات الأدمن (يقدرون يستخدمون أوامر الإدارة)
  adminRoles: [
    '',
  ],

  // صور وألوان 

  menuImage: 'https://timg.eu.cc/BR184u_RJz.png',

  lobbyImages: {
    roulette:  'img/roulette.png', // روليت
    mafia:     'https://timg.eu.cc/7BqRG30LFH.png', // مافيا 
    dice:      'https://timg.eu.cc/jYFN4GK30G.png', // نرد 
    hide:      'https://timg.eu.cc/vBgwQ-NM-I.png', // هايد او غميضة 
    rps:       'https://timg.eu.cc/F6skdkx7Z5.png', // حجرة ورقة مقص 
    bomb:      'https://timg.eu.cc/G8ImtsgN3I.png', // قنبلة 
    replica:   'https://timg.eu.cc/Weat0p7pk_.png', // ريبلكا 
    xo:        'https://timg.eu.cc/mo96RwDxpE.png', // اكس-و 
    chairs:    'https://timg.eu.cc/swFHoZJXQM.png', // كراس
    mahbas:    'https://timg.eu.cc/2oSPlSjLG-.png', // محبس
    reverse:   'https://timg.eu.cc/IWQN7p3a-j.png', // عكسي
    outsider:  'img/out.png', // برا السالفة
  },

  // صور المتجر لكل لعبة (اختياري)
shopImages: {
  roulette: 'img/rshop.png',
},

   // الاوان تبع الشريط الجانبي للأمبيد v2
  colors: {
    roulette:  0xFFFFFF,
    mafia:     0xFFFFFF,
    dice:      0xFFFFFF,
    hide:      0xFFFFFF,
    rps:       0xFFFFFF,
    bomb:      0xFFFFFF,
    replica:   0xFFFFFF,
    xo:        0xFFFFFF,
    chairs:    0xFFFFFF,
    flags:     0xFFFFFF,
    fast:      0xFFFFFF,
    button:    0xFFFFFF,
    question:  0xFFFFFF,
    wisdom:    0xFFFFFF,
    joke:      0xFFFFFF,
    wyr:       0xFFFFFF,
    mahbas:    0xFFFFFF,
    reverse:   0xFFFFFF,
    outsider:  0xFFFFFF,
    error:     0xFFFFFF,
    success:   0xFFFFFF,
    neutral:   0xFFFFFF,
    closed:    0xFFFFFF,
  },

  // نقاط وأوقات 

  winPoints: {
    roulette:  10,
    mafia:     10,
    dice:      10,
    hide:      10,
    rps:       { min: 5, max: 15 },
    bomb:      { min: 5, max: 15 },
    replica:   { min: 5, max: 15 },
    xo:        { min: 5, max: 15 },
    chairs:    10,
    mahbas:    10,
    reverse:   10,
    outsider:  10,
  },

  lobbyTime: {
    roulette:  40000,
    mafia:     40000,
    dice:      40000,
    hide:      40000,
    rps:       40000,
    bomb:      40000,
    replica:   40000,
    xo:        40000,
    chairs:    40000,
    mahbas:    40000,
    reverse:   40000,
    outsider:  40000,
  },

  // أسعار قدرات الروليت و المتجر

  abilityCosts: {
    roulette: {
      nuclear: 200,
      reverse:  50,
      protect:  40,
      freeze:   40,
      twice:    30,
      revive:   20,
    }
  },

};
