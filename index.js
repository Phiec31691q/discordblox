require('net').setDefaultAutoSelectFamily(false);
/* ============================================================
   STUDIOBLOX v2.0.0 - AMIRAL GEMISI
   v2.0: baslik emojileri temizlendi, basvuru DM butonlu
   geri-donme, PET SISTEMI (6 nadirlik), OWNER komutlari,
   streak, xp/seviye, daha detayli bakiye profili.
   ============================================================ */
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  ChannelType, PermissionFlagsBits,
  Partials, AttachmentBuilder, SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');

/* ========================= CONFIG ========================= */
const CONFIG = {
  token: process.env.TOKEN || "",
  ownerId: process.env.OWNER_ID || "",
  mequeenBanner: process.env.MEQUEEN_BANNER || "",
  version: "2.0.0"
};
if (!CONFIG.token) { console.error('[HATA] Render Environment icinde TOKEN yok!'); process.exit(1); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

/* ========================= DB ========================= */
const DB_PATH = './database.json';
const emptyDB = () => ({ guilds: {}, users: {}, giveaways: {}, tickets: {}, apps: {} });
let DB = emptyDB();
let mongoCol = null;
async function initDB() {
  if (process.env.MONGO_URL) {
    const { MongoClient } = require('mongodb');
    const mc = new MongoClient(process.env.MONGO_URL);
    await mc.connect();
    mongoCol = mc.db('studioblox').collection('data');
    const doc = await mongoCol.findOne({ _id: 'main' });
    if (doc && doc.data) DB = Object.assign(emptyDB(), doc.data);
    console.log('[STUDIOBLOX] DB: MongoDB bagli.');
  } else {
    try { DB = Object.assign(emptyDB(), JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))); } catch (e) {}
    console.log('[STUDIOBLOX] DB: database.json');
  }
}
function saveDB() {
  if (mongoCol) { mongoCol.replaceOne({ _id: 'main' }, { _id: 'main', data: DB }, { upsert: true }).catch(e => console.error('mongo save:', e.message)); return; }
  try { fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 2)); } catch (e) {}
}
setInterval(saveDB, 20000);
process.on('exit', saveDB);

function gconf(gid) {
  if (!DB.guilds[gid]) DB.guilds[gid] = {
    modlog: null, autorole: null,
    guard: { kufur: false, reklam: false }, strikes: {}, warns: {},
    ticket: null, app: null,
    usercount: { enabled: false, lang: 'en', categoryId: null, ch1: null, ch2: null }
  };
  return DB.guilds[gid];
}
function uconf(uid) {
  if (!DB.users[uid]) DB.users[uid] = {
    balance: 0, bank: 0, inv: [], badges: [], pets: [],
    xp: 0, level: 1, streak: 0, lastDaily: 0,
    cd: { daily: 0, work: 0, ara: 0 }
  };
  /* eski kayitlari genislet */
  const u = DB.users[uid];
  if (!u.pets) u.pets = [];
  if (u.xp === undefined) u.xp = 0;
  if (!u.level) u.level = 1;
  if (u.streak === undefined) u.streak = 0;
  if (!u.lastDaily) u.lastDaily = 0;
  return u;
}

/* ========================= YARDIMCILAR ========================= */
const E = (c = 0x5865F2) => new EmbedBuilder().setColor(c).setTimestamp().setFooter({ text: `Studioblox • v${CONFIG.version}` });
const ERR = (t) => E(0xED4245).setDescription(`> **Hata**\n${t}`);
const OKC = (t) => E(0x57F287).setDescription(`> **Basarili**\n${t}`);
const now = () => Date.now();
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (a) => a[rnd(0, a.length - 1)];
const isOwner = (u) => u.id === CONFIG.ownerId;
const balF = (x) => `**R$ ${x.toLocaleString('tr-TR')}**`;

function parseDur(str) {
  const m = String(str).toLowerCase().match(/(\d+)\s*(sn|s|dk|m|min|sa|h|g|d)/);
  if (!m) return null;
  const n = parseInt(m[1]); const u = m[2];
  if (u === 'sn' || u === 's') return n * 1000;
  if (u === 'dk' || u === 'm' || u === 'min') return n * 60000;
  if (u === 'sa' || u === 'h') return n * 3600000;
  if (u === 'g' || u === 'd') return n * 86400000;
  return null;
}
function fmtDur(ms) {
  const g = Math.floor(ms / 86400000), s = Math.floor(ms / 3600000) % 24, d = Math.floor(ms / 60000) % 60;
  let out = [];
  if (g) out.push(g + ' gun');
  if (s) out.push(s + ' saat');
  if (d) out.push(d + ' dakika');
  return out.join(', ') || 'birkac saniye';
}
async function dmUser(user, payload) { try { await user.send(payload); return true; } catch (e) { return false; } }
async function modlog(guild, embed) {
  const c = gconf(guild.id).modlog; if (!c) return;
  const ch = guild.channels.cache.get(c);
  if (ch) try { await ch.send({ embeds: [embed] }); } catch (e) {}
}
function adminCheck(i) { return isOwner(i.user) || (i.member && i.member.permissions.has(PermissionFlagsBits.Administrator)); }
function modCheck(i) { return isOwner(i.user) || (i.member && (i.member.permissions.has(PermissionFlagsBits.ModerateMembers) || i.member.permissions.has(PermissionFlagsBits.Administrator))); }

async function refresh(i, payload) {
  try {
    if (i.deferred || i.replied) return await i.editReply(payload);
    return await i.update(payload);
  } catch (e) {
    try { return await i.followUp(payload); } catch (e2) {}
  }
}
async function collectChannel(i, prompt, timeout = 180000) {
  try { await i.followUp({ embeds: [E().setDescription(prompt + '\n-# Cevabini bu kanala yaz, 3 dk icinde.')], ephemeral: true }); }
  catch (e) { try { await i.reply({ embeds: [E().setDescription(prompt + '\n-# Cevabini bu kanala yaz, 3 dk icinde.')], ephemeral: true }); } catch (e2) {} }
  const got = await i.channel.awaitMessages({ filter: m => m.author.id === i.user.id, max: 1, time: timeout }).catch(() => null);
  if (!got || !got.size) return null;
  got.first().delete().catch(() => {});
  return got.first().content.trim();
}

const STATE = new Map();
const sKey = (i, extra = '') => `${i.guild ? i.guild.id : 'dm'}:${i.user.id}${extra}`;
setInterval(() => { for (const [k, v] of STATE) if (v.exp && v.exp < now()) STATE.delete(k); }, 300000);

/* ========================= KUFUR/REKLAM ========================= */
const KUFUR = ['amk', 'aq', 'amq', 'orospu', 'piç', 'pic', 'sik', 'sikim', 'sikerim', 'yarrak', 'göt', 'gavat', 'pezevenk', 'kahpe', 'yavşak', 'amcık', 'amına', 'amina', 'oc', 'godoş', 'kerhane', 'sürtük'];
const KUFUR_RX = new RegExp(`\\b(${KUFUR.join('|')})\\b`, 'i');
const REKLAM_RX = /(discord\.gg|discord\.me|discord\.io|discordapp\.com\/invite|discord\.com\/invite)/i;

/* ========================= MEQUEEN ========================= */
const MEQUEEN_TEXT = `**Sunucu Destek**

> Asagidaki ticket kurallarini okuduktan sonra ticket kategorisinden kategori secerek ticket acabilirsiniz. Kurallari okudunuz sayilacaktir.

- Yanlis sebep ile ticket acmak yasaktir.
- Actiktan sonra maksimum tag siniri **2**'dir.
- Troll veya test amacli ticket acmak yasaktir.

**Kategoriler:** \`Bug Bildir\` • \`Sikayet\` • \`Yetkili Alim\` • \`Diger\``;
const MEQUEEN_CATS = ['Bug Bildir', 'Sikayet', 'Yetkili Alim', 'Diger'];

/* ========================= EKONOMI & PET ========================= */
const SHOP = [
  { id: 'boost2x', name: '2x Kazanc Boostu (1 saat)', price: 1000, desc: '1 saat boyunca daily/calıs/ara kazanc x2.' },
  { id: 'sans', name: 'Sans Tilsimi', price: 750, desc: 'Sonraki /robux ara kazanci garantili 150-300 R$.' },
  { id: 'vip', name: 'VIP Rozet', price: 5000, desc: 'Kalici VIP rozeti.' },
  { id: 'egg_normal', name: 'Normal Yumurta', price: 500, desc: 'COMMON/UNCOMMON agirlikli. Bir pet cikarir.' },
  { id: 'egg_premium', name: 'Premium Yumurta', price: 2500, desc: 'RARE+ garanti, EPIC+ %40.' },
  { id: 'egg_mystic', name: 'Mystic Yumurta', price: 15000, desc: 'Garantili LEGENDARY veya MYSTIC.' }
];
const JOBS = ['Game Developer', 'Builder', 'Scripter', 'UI Tasarimci', 'Animator', 'Moderator', 'Youtuber', 'Pizza Kuryesi', 'Streamer', 'Tester'];

/* 6 NADIRLIK SEVIYESI */
const RARITIES = {
  COMMON:    { label: 'COMMON',    color: 0x95A5A6, chance: 50,   boost: 50 },
  UNCOMMON:  { label: 'UNCOMMON',  color: 0x2ECC71, chance: 25,   boost: 100 },
  RARE:      { label: 'RARE',      color: 0x3498DB, chance: 15,   boost: 250 },
  EPIC:      { label: 'EPIC',      color: 0x9B59B6, chance: 7,    boost: 500 },
  LEGENDARY: { label: 'LEGENDARY', color: 0xF1C40F, chance: 2.5,  boost: 1500 },
  MYSTIC:    { label: 'MYSTIC',    color: 0xE91E63, chance: 0.5,  boost: 5000 }
};
const PETS_POOL = [
  { name: 'Kedi',       emoji: '🐱' },
  { name: 'Kopek',      emoji: '🐶' },
  { name: 'Tavsan',     emoji: '🐰' },
  { name: 'Kurt',       emoji: '🐺' },
  { name: 'Tilki',      emoji: '🦊' },
  { name: 'Kaplan',     emoji: '🐯' },
  { name: 'Aslan',      emoji: '🦁' },
  { name: 'Kartal',     emoji: '🦅' },
  { name: 'Yilan',      emoji: '🐍' },
  { name: 'Ejderha',    emoji: '🐉' },
  { name: 'Anka',       emoji: '🔥' },
  { name: 'Unicorn',    emoji: '🦄' },
  { name: 'Phoenix',    emoji: '🕊️' }
];
function rollRarity(eggType) {
  if (eggType === 'egg_mystic') {
    return Math.random() < 0.25 ? 'MYSTIC' : 'LEGENDARY';
  }
  if (eggType === 'egg_premium') {
    /* RARE+ garanti */
    const pool = ['RARE','EPIC','LEGENDARY','MYSTIC'];
    const weights = [15, 7, 2.5, 0.5];
    const total = weights.reduce((a,b)=>a+b, 0);
    let r = Math.random() * total;
    for (let x = 0; x < pool.length; x++) { r -= weights[x]; if (r <= 0) return pool[x]; }
    return 'RARE';
  }
  /* normal */
  const all = Object.keys(RARITIES);
  let r = Math.random() * 100;
  for (const k of all) { r -= RARITIES[k].chance; if (r <= 0) return k; }
  return 'COMMON';
}
function rollPet(eggType) {
  const rarity = rollRarity(eggType);
  const pet = pick(PETS_POOL);
  return {
    id: `${rarity.toLowerCase()}_${pet.name.toLowerCase().replace(/[^a-z]/g,'')}_${Date.now().toString(36)}`,
    name: pet.name, emoji: pet.emoji, rarity,
    boost: RARITIES[rarity].boost, equipped: false, obtained: now()
  };
}
function petBoostTotal(uid) {
  const u = uconf(uid);
  return u.pets.filter(p => p.equipped).reduce((s, p) => s + (RARITIES[p.rarity]?.boost || 0), 0);
}
function hasBoost(u, id) {
  const it = uconf(u.id).inv.find(x => x.id === id);
  if (!it) return false;
  if (it.until && it.until < now()) { uconf(u.id).inv = uconf(u.id).inv.filter(x => x !== it); return false; }
  return true;
}
function boostMul(u) {
  let m = 1;
  if (hasBoost(u, 'boost2x')) m *= 2;
  m += petBoostTotal(u.id) / 1000; /* her 1000 boost = +1x */
  return m;
}

/* XP / SEVIYE */
function xpForLevel(lvl) { return Math.floor(100 * Math.pow(lvl, 1.5)); }
function addXP(uid, amount) {
  const u = uconf(uid);
  u.xp += amount;
  let ups = 0;
  while (u.xp >= xpForLevel(u.level)) { u.xp -= xpForLevel(u.level); u.level++; ups++; }
  return ups;
}

/* ========================= KOMUTLAR ========================= */
const CMDS = [];

/* ===================== OWNER KOMUTLARI ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('owner').setDescription('Sadece bot sahibi icin yonetim komutlari')
    .addSubcommand(s => s.setName('setbalance').setDescription('Bir uyenin bakiyesini ayarla')
      .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
      .addIntegerOption(o => o.setName('miktar').setDescription('Yeni bakiye').setRequired(true)))
    .addSubcommand(s => s.setName('give').setDescription('Kendine sinirsiz R$ ekle')
      .addIntegerOption(o => o.setName('miktar').setDescription('Eklenecek miktar').setRequired(true)))
    .addSubcommand(s => s.setName('givepet').setDescription('Bir uyeye pet ver')
      .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
      .addStringOption(o => o.setName('rarity').setDescription('Nadirlik').setRequired(true)
        .addChoices({ name: 'COMMON', value: 'COMMON' }, { name: 'UNCOMMON', value: 'UNCOMMON' },
                    { name: 'RARE', value: 'RARE' }, { name: 'EPIC', value: 'EPIC' },
                    { name: 'LEGENDARY', value: 'LEGENDARY' }, { name: 'MYSTIC', value: 'MYSTIC' })))
    .addSubcommand(s => s.setName('resetuser').setDescription('Bir uyenin verilerini sifirla')
      .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true)))
    .addSubcommand(s => s.setName('globalmsg').setDescription('Tum sunuculara mesaj at')
      .addStringOption(o => o.setName('mesaj').setDescription('Mesaj').setRequired(true))),
  async execute(i) {
    if (!isOwner(i.user)) return i.reply({ embeds: [ERR('Bu komutu sadece **bot sahibi** kullanabilir.')], ephemeral: true });
    const sub = i.options.getSubcommand();
    if (sub === 'setbalance') {
      const t = i.options.getUser('uye'); const m = i.options.getInteger('miktar');
      uconf(t.id).balance = m;
      return i.reply({ embeds: [OKC(`${t.tag} bakiyesi ${balF(m)} olarak ayarlandi.`)] });
    }
    if (sub === 'give') {
      const m = i.options.getInteger('miktar');
      uconf(i.user.id).balance += m;
      return i.reply({ embeds: [OKC(`Kendine ${balF(m)} eklendi. Yeni bakiye: ${balF(uconf(i.user.id).balance)}`)] });
    }
    if (sub === 'givepet') {
      const t = i.options.getUser('uye');
      const rarity = i.options.getString('rarity');
      const pet = { ...rollPet('egg_normal'), rarity }; /* base pet */
      pet.boost = RARITIES[rarity].boost;
      pet.id = `${rarity.toLowerCase()}_${pet.name.toLowerCase().replace(/[^a-z]/g,'')}_own_${Date.now().toString(36)}`;
      uconf(t.id).pets.push(pet);
      return i.reply({ embeds: [OKC(`${t.tag} kullanicisina **${rarity}** ${pet.emoji} ${pet.name} verildi.`)] });
    }
    if (sub === 'resetuser') {
      const t = i.options.getUser('uye');
      DB.users[t.id] = { balance: 0, bank: 0, inv: [], badges: [], pets: [], xp: 0, level: 1, streak: 0, lastDaily: 0, cd: { daily: 0, work: 0, ara: 0 } };
      return i.reply({ embeds: [OKC(`${t.tag} verileri sifirlandi.`)] });
    }
    if (sub === 'globalmsg') {
      const txt = i.options.getString('mesaj');
      await i.reply({ embeds: [E().setDescription('> Global mesaj gonderiliyor...')], ephemeral: true });
      let okc = 0, fail = 0;
      for (const g of client.guilds.cache.values()) {
        const ch = g.systemChannel || g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages));
        if (ch) { try { await ch.send({ embeds: [E(0x57F287).setTitle('Studioblox Global Duyuru').setDescription(txt).setFooter({ text: 'Bot sahibinden' })] }); okc++; } catch (e) { fail++; } }
        else fail++;
        await new Promise(r => setTimeout(r, 200));
      }
      return i.editReply({ embeds: [OKC(`Global mesaj gonderildi: ${okc} basarili, ${fail} basarisiz.`)] });
    }
  }
});

/* ===================== TICKET ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('ticket-kur').setDescription('Kategori secmeli gelismis ticket sistemi kurar').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    STATE.set(sKey(i) + ':tk', { exp: now() + 900000 });
    await i.reply({
      embeds: [E().setTitle('Ticket Sistemi Kurulumu').setDescription('**Kurulum adimlari:**\n`1.` Kurulum tipini sec\n`2.` Panel kanali + etiket rolleri sec\n`3.` **Devam** de, bilgileri kanala yaz\n`4.` Panel otomatik olusturulur')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk:mode:kategorili').setLabel('Kategorili Kur').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('tk:mode:kategorisiz').setLabel('Kategorisiz Kur').setStyle(ButtonStyle.Secondary))],
      ephemeral: true
    });
  }
});

CMDS.push({
  data: new SlashCommandBuilder().setName('ticket-kur-mequeen').setDescription('Mequeen Studio hazir ticket paneli kurar').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    STATE.set(sKey(i) + ':mq', { exp: now() + 900000 });
    await i.reply({
      embeds: [E().setTitle('Mequeen Studio Ticket Kurulumu').setDescription('> Hazir sablon: **Mequeen Studio Destek & Support**\n\n`1.` Panelin atilacagi kanali sec\n`2.` Ticket acilinca etiketlenecek rolleri sec (isteğe bagli)\n`3.` **Paneli Kur** butonuna bas')],
      components: [
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('mq:kanal').setPlaceholder('Panel kanali sec...').setChannelTypes([ChannelType.GuildText])),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('mq:rol').setPlaceholder('Etiketlenecek roller (istege bagli)').setMinValues(0).setMaxValues(5)),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mq:kur').setLabel('Paneli Kur').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('tk:iptal').setLabel('Iptal').setStyle(ButtonStyle.Danger))],
      ephemeral: true
    });
  }
});

/* ===================== MODERASYON ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('ban').setDescription('Uyeyi yasaklar').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Yasaklanacak uye').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Ban sebebi'))
    .addIntegerOption(o => o.setName('mesaj_sil').setDescription('Son X saniye mesajlarini sil')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    if (!m) return i.reply({ embeds: [ERR('Uye bulunamadi.')], ephemeral: true });
    if (m.id === i.user.id || (m.roles.highest.position >= i.member.roles.highest.position && !isOwner(i.user)))
      return i.reply({ embeds: [ERR('Bu uyeye islem uygulayamazsin.')], ephemeral: true });
    const sebep = i.options.getString('sebep') || 'Sebep belirtilmedi';
    const ds = i.options.getInteger('mesaj_sil') || 0;
    await dmUser(m.user, E(0xED4245).setDescription(`> **BAN**\n**Sunucu:** ${i.guild.name}\n**Sebep:** ${sebep}\n**Yetkili:** ${i.user.tag}`));
    await m.ban({ deleteMessageSeconds: ds, reason: `${sebep} | ${i.user.tag}` });
    await modlog(i.guild, E(0xED4245).setDescription(`> **BAN**\n**Uye:** ${m.user.tag} (${m.id})\n**Yetkili:** ${i.user.tag}\n**Sebep:** ${sebep}`));
    i.reply({ embeds: [OKC(`${m.user.tag} yasaklandi.\n-# Sebep: ${sebep}`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('unban').setDescription('Ban kaldirir').setDMPermission(false)
    .addStringOption(o => o.setName('id').setDescription('Kullanici ID').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const id = i.options.getString('id');
    try {
      const u = await i.guild.bans.fetch(id);
      await i.guild.bans.remove(id, i.user.tag);
      await modlog(i.guild, E(0x57F287).setDescription(`> **UNBAN**\n**Uye:** ${u.user.tag}\n**Yetkili:** ${i.user.tag}`));
      i.reply({ embeds: [OKC(`${u.user.tag} bani kaldirildi.`)] });
    } catch (e) { i.reply({ embeds: [ERR('Bu ID ile banli uye bulunamadi.')], ephemeral: true }); }
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('kick').setDescription('Uyeyi atar').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    if (!m || !m.kickable) return i.reply({ embeds: [ERR('Uye atilamaz.')], ephemeral: true });
    const sebep = i.options.getString('sebep') || 'Sebep belirtilmedi';
    await dmUser(m.user, E(0xED4245).setDescription(`> **KICK**\n**Sunucu:** ${i.guild.name}\n**Sebep:** ${sebep}`));
    await m.kick(`${sebep} | ${i.user.tag}`);
    await modlog(i.guild, E(0xED4245).setDescription(`> **KICK**\n**Uye:** ${m.user.tag}\n**Yetkili:** ${i.user.tag}\n**Sebep:** ${sebep}`));
    i.reply({ embeds: [OKC(`${m.user.tag} sunucudan atildi.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('mute').setDescription('Uyeyi sureli susturur').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
    .addStringOption(o => o.setName('sure').setDescription('Orn: 10m, 1h, 1d').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const ms = parseDur(i.options.getString('sure'));
    if (!m || !m.moderatable) return i.reply({ embeds: [ERR('Uyeye timeout atilamaz.')], ephemeral: true });
    if (!ms || ms > 2419200000) return i.reply({ embeds: [ERR('Gecersiz sure.')], ephemeral: true });
    const sebep = i.options.getString('sebep') || 'Sebep belirtilmedi';
    await m.timeout(ms, `${sebep} | ${i.user.tag}`);
    await modlog(i.guild, E(0xFEE75C).setDescription(`> **MUTE**\n**Uye:** ${m.user.tag}\n**Sure:** ${fmtDur(ms)}\n**Sebep:** ${sebep}`));
    i.reply({ embeds: [OKC(`${m.user.tag}, **${fmtDur(ms)}** boyunca susturuldu.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('unmute').setDescription('Susturmayi kaldirir').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    if (!m) return i.reply({ embeds: [ERR('Uye bulunamadi.')], ephemeral: true });
    await m.timeout(null, i.user.tag);
    i.reply({ embeds: [OKC(`${m.user.tag} susturmasi kaldirildi.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('clear').setDescription('Kanaldan mesaj siler').setDMPermission(false)
    .addIntegerOption(o => o.setName('miktar').setDescription('1-100 arasi').setRequired(true).setMinValue(1).setMaxValue(100)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const n = i.options.getInteger('miktar');
    const msgs = await i.channel.messages.fetch({ limit: n });
    const sil = msgs.filter(m => (now() - m.createdTimestamp) < 1209600000);
    await i.channel.bulkDelete(sil, true);
    i.reply({ embeds: [OKC(`**${sil.size}** mesaj silindi.`)] }).then(r => setTimeout(() => r.delete().catch(() => {}), 5000));
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('warn').setDescription('Uyeyi uyarir').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const g = gconf(i.guild.id);
    if (!g.warns[m.id]) g.warns[m.id] = [];
    g.warns[m.id].push({ by: i.user.id, reason: i.options.getString('sebep'), time: now() });
    await dmUser(m.user, E(0xFEE75C).setDescription(`> **UYARI**\n**Sunucu:** ${i.guild.name}\n**Sebep:** ${i.options.getString('sebep')}\n**Toplam uyari:** ${g.warns[m.id].length}`));
    await modlog(i.guild, E(0xFEE75C).setDescription(`> **WARN**\n**Uye:** ${m.user.tag}\n**Sebep:** ${i.options.getString('sebep')}`));
    i.reply({ embeds: [OKC(`${m.user.tag} uyarlildi. (Toplam: ${g.warns[m.id].length})`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('uyarilar').setDescription('Uyari listesi').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const list = gconf(i.guild.id).warns[m.id] || [];
    i.reply({ embeds: [E().setTitle('Uyari Listesi').setDescription(list.length ? list.map((w, x) => `**${x + 1}.** ${w.reason}\n-# <t:${Math.floor(w.time / 1000)}:f> • <@${w.by}>`).join('\n\n') : '> Bu uyenin uyarisi yok.')], ephemeral: true });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('uyari-sil').setDescription('Uyari siler').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
    .addIntegerOption(o => o.setName('no').setDescription('Uyari numarasi').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const g = gconf(i.guild.id);
    const list = g.warns[m.id] || [];
    const no = i.options.getInteger('no') - 1;
    if (!list[no]) return i.reply({ embeds: [ERR('Bu numarada uyari yok.')], ephemeral: true });
    list.splice(no, 1);
    i.reply({ embeds: [OKC('Uyari silindi.')] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('slowmode').setDescription('Yavas mod').setDMPermission(false)
    .addIntegerOption(o => o.setName('saniye').setDescription('0-21600').setRequired(true).setMinValue(0).setMaxValue(21600)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    await i.channel.setRateLimitPerUser(i.options.getInteger('saniye'));
    i.reply({ embeds: [OKC(`Yavas mod: **${i.options.getInteger('saniye')}sn**`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('kilitle').setDescription('Kanali kilitler').setDMPermission(false)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanal (bossa mevcut)')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const ch = i.options.getChannel('kanal') || i.channel;
    await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false });
    await modlog(i.guild, E(0xED4245).setDescription(`> **KILIT**\n**Kanal:** ${ch}`));
    i.reply({ embeds: [OKC(`${ch} kanali kilitlendi.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('kilit-ac').setDescription('Kanal kilidini acar').setDMPermission(false)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanal (bossa mevcut)')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const ch = i.options.getChannel('kanal') || i.channel;
    await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: true });
    i.reply({ embeds: [OKC(`${ch} kanali acildi.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('otorol').setDescription('Oto rol').setDMPermission(false)
    .addSubcommand(s => s.setName('kur').setDescription('Otorol kurar').addRoleOption(o => o.setName('rol').setDescription('Verilecek rol').setRequired(true)))
    .addSubcommand(s => s.setName('kapat').setDescription('Otorolu kapatir')),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    const g = gconf(i.guild.id);
    if (i.options.getSubcommand() === 'kur') {
      g.autorole = i.options.getRole('rol').id;
      i.reply({ embeds: [OKC(`Otorol kuruldu: <@&${g.autorole}>`)] });
    } else { g.autorole = null; i.reply({ embeds: [OKC('Otorol kapatildi.')] }); }
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('guard').setDescription('Guard filtreleri').setDMPermission(false)
    .addSubcommand(s => s.setName('kufur').setDescription('Turkce kufur filtresi')
      .addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({ name: 'Ac', value: 'ac' }, { name: 'Kapat', value: 'kapat' })))
    .addSubcommand(s => s.setName('reklam').setDescription('Davet linki filtresi')
      .addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({ name: 'Ac', value: 'ac' }, { name: 'Kapat', value: 'kapat' }))),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    const g = gconf(i.guild.id);
    const sub = i.options.getSubcommand();
    const ac = i.options.getString('durum') === 'ac';
    if (sub === 'kufur') g.guard.kufur = ac; else g.guard.reklam = ac;
    i.reply({ embeds: [OKC(`**${sub === 'kufur' ? 'Kufur Filtresi' : 'Reklam Filtresi'}:** ${ac ? '**ACIK**' : '**KAPALI**'}`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('log-kur').setDescription('Modlog kanali ayarlar').setDMPermission(false)
    .addChannelOption(o => o.setName('kanal').setDescription('Log kanali').setRequired(true).addChannelTypes(ChannelType.GuildText)),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    gconf(i.guild.id).modlog = i.options.getChannel('kanal').id;
    i.reply({ embeds: [OKC(`Modlog kanali: ${i.options.getChannel('kanal')}`)] });
  }
});

/* ===================== DUYURU (kanala yazmali) ===================== */
function duyuruCmd(name, desc, type) {
  CMDS.push({
    data: new SlashCommandBuilder().setName(name).setDescription(desc).setDMPermission(false),
    async execute(i) {
      if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
      await i.deferReply({ ephemeral: true });
      const baslik = await collectChannel(i, `> **1/5 BASLIK** — ${type === 'leak' ? 'Leak duyurusu' : 'Guncelleme duyurusu'} basligini yaz:`);
      if (!baslik) return i.editReply({ embeds: [ERR('Sure doldu, duyuru iptal.')], components: [] });
      const icerik = await collectChannel(i, '> **2/5 ICERIK** — Duyuru metnini yaz (markdown serbest):');
      if (!icerik) return i.editReply({ embeds: [ERR('Sure doldu.')], components: [] });
      const thumb = await collectChannel(i, '> **3/5 THUMBNAIL** — Kucuk gorsel URL yaz (yoksa `-`):');
      if (thumb === null) return i.editReply({ embeds: [ERR('Sure doldu.')], components: [] });
      const image = await collectChannel(i, '> **4/5 BUYUK GORSEL** — URL yaz (yoksa `-`):');
      if (image === null) return i.editReply({ embeds: [ERR('Sure doldu.')], components: [] });
      const renk = await collectChannel(i, '> **5/5 RENK** — Hex kod yaz (orn: `5865F2`, yoksa `-`):');
      if (renk === null) return i.editReply({ embeds: [ERR('Sure doldu.')], components: [] });
      const st = {
        exp: now() + 600000, type, baslik, icerik,
        thumb: thumb === '-' ? null : thumb, image: image === '-' ? null : image,
        renk: renk === '-' ? null : renk, kanal: i.channel.id, mention: 'yok', rol: null
      };
      STATE.set(sKey(i) + ':ann', st);
      return annPreview(i);
    }
  });
}
duyuruCmd('güncelleme-duyuru', 'Profesyonel guncelleme duyurusu', 'guncelleme');
duyuruCmd('leak-duyuru', 'Profesyonel leak duyurusu', 'leak');

function annEmbed(a, user) {
  const color = a.renk ? parseInt(String(a.renk).replace('#', ''), 16) || (a.type === 'leak' ? 0xED4245 : 0x57F287) : (a.type === 'leak' ? 0xED4245 : 0x57F287);
  const eb = E(color);
  if (a.type === 'leak') eb.setDescription(`**LEAK / SIZINTI BULTENI**\n> **${a.baslik}**\n> *Kaynak dogrulanmamistir; paylasim sorumlulugu kullaniciya aittir.*\n\n${a.icerik}`);
  else eb.setDescription(`**GUNCELLEME DUYURUSU**\n> **${a.baslik}**\n\n${a.icerik}`);
  if (a.thumb) eb.setThumbnail(a.thumb);
  if (a.image) eb.setImage(a.image);
  eb.setFooter({ text: `Duyuruyu hazirlayan: ${user.tag} • Studioblox` });
  return eb;
}
async function annPreview(i) {
  const st = STATE.get(sKey(i) + ':ann');
  if (!st) return;
  const rows = [
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('ann:kanal').setPlaceholder('Hedef kanal (bossa mevcut)').setChannelTypes([ChannelType.GuildText])),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ann:mention').setPlaceholder('Etiket sec...').addOptions({ label: 'Etiket Yok', value: 'yok' }, { label: '@everyone', value: 'everyone' }, { label: '@here', value: 'here' }, { label: 'Rol', value: 'rol' })),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ann:gonder').setLabel('Duyuruyu Gonder').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ann:iptal').setLabel('Iptal').setStyle(ButtonStyle.Danger))
  ];
  return refresh(i, { embeds: [annEmbed(st, i.user).setTitle('ONIZLEME')], components: rows });
}

/* ===================== CEKILIS ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('çekiliş').setDescription('Gelismis cekilis sistemi').setDMPermission(false)
    .addSubcommand(s => s.setName('baslat').setDescription('Cekilis baslatir')
      .addStringOption(o => o.setName('sure').setDescription('Orn: 3d, 6h, 30m').setRequired(true))
      .addStringOption(o => o.setName('odul').setDescription('Odul adi').setRequired(true))
      .addIntegerOption(o => o.setName('kazanan').setDescription('Kazanan sayisi').setRequired(true).setMinValue(1).setMaxValue(20))
      .addStringOption(o => o.setName('tur').setDescription('Cekilis turu').setRequired(true).addChoices({ name: 'Normal', value: 'normal' }, { name: 'Rol Sartli', value: 'rol' }, { name: 'Emek Sartli', value: 'emek' }))
      .addRoleOption(o => o.setName('rol').setDescription('Rol sarti'))
      .addChannelOption(o => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('ping').setDescription('Bitis hatirlatma pingi').addChoices({ name: 'Yok', value: 'yok' }, { name: 'Everyone', value: 'everyone' }, { name: 'Here', value: 'here' }, { name: 'Rol', value: 'rol' }))
      .addRoleOption(o => o.setName('ping_rol').setDescription('Ping rolu'))
      .addStringOption(o => o.setName('aciklama').setDescription('Ek aciklama')))
    .addSubcommand(s => s.setName('bitir').setDescription('Erken bitirir').addStringOption(o => o.setName('mesaj_id').setDescription('Cekilis mesaj ID').setRequired(true)))
    .addSubcommand(s => s.setName('yeniden').setDescription('Reroll').addStringOption(o => o.setName('mesaj_id').setDescription('Cekilis mesaj ID').setRequired(true))),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const sub = i.options.getSubcommand();
    if (sub === 'baslat') {
      const ms = parseDur(i.options.getString('sure'));
      if (!ms || ms < 60000) return i.reply({ embeds: [ERR('Gecersiz sure.')], ephemeral: true });
      const ch = i.options.getChannel('kanal') || i.channel;
      const g = {
        gid: i.guild.id, cid: ch.id, mid: null, end: now() + ms,
        winners: i.options.getInteger('kazanan'), prize: i.options.getString('odul'),
        type: i.options.getString('tur'), roleReq: i.options.getRole('rol') ? i.options.getRole('rol').id : null,
        ping: i.options.getString('ping') || 'yok', pingRole: i.options.getRole('ping_rol') ? i.options.getRole('ping_rol').id : null,
        desc: i.options.getString('aciklama') || null, parts: [], rem6: false, rem1: false, ended: false, sponsor: i.user.id
      };
      const msg = await ch.send({ embeds: [gwEmbed(g)], components: [gwRow(g)] });
      g.mid = msg.id;
      DB.giveaways[msg.id] = g;
      i.reply({ embeds: [OKC(`Cekilis baslatildi: ${msg.url}\n> Bitis: <t:${Math.floor(g.end / 1000)}:R>`)], ephemeral: true });
    }
    if (sub === 'bitir' || sub === 'yeniden') {
      const g = DB.giveaways[i.options.getString('mesaj_id')];
      if (!g || g.gid !== i.guild.id) return i.reply({ embeds: [ERR('Cekilis bulunamadi.')], ephemeral: true });
      if (sub === 'bitir') { if (g.ended) return i.reply({ embeds: [ERR('Bu cekilis zaten bitmis.')], ephemeral: true }); await endGiveaway(g, false); i.reply({ embeds: [OKC('Cekilis bitirildi.')], ephemeral: true }); }
      else { await endGiveaway(g, true); i.reply({ embeds: [OKC('Yeniden kazanan cekildi.')], ephemeral: true }); }
    }
  }
});
function gwRow(g) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw:join:${g.mid || 'new'}`).setLabel('Katil').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('gw:info').setLabel('Katilimcilar').setStyle(ButtonStyle.Secondary));
}
function gwEmbed(g) {
  const eb = E(0xFEE75C).setTitle(`CEKILIS: ${g.prize}`);
  const tur = g.type === 'rol' ? 'Rol Sartli' : g.type === 'emek' ? 'Emek Sartli' : 'Normal';
  let d = `**Odul:** ${g.prize}\n**Kazanan:** ${g.winners} kisi\n**Tur:** ${tur}\n**Bitis:** <t:${Math.floor(g.end / 1000)}:R> (<t:${Math.floor(g.end / 1000)}:f>)\n**Katilimci:** ${g.parts.length} uye`;
  if (g.roleReq) d += `\n**Sart:** <@&${g.roleReq}> rolu`;
  if (g.desc) d += `\n\n> ${g.desc}`;
  d += `\n\n> Katil butonuna basarak katil!`;
  eb.setDescription(d);
  if (g.ended) { eb.setColor(0x57F287); eb.setTitle(`CEKILIS BITTI: ${g.prize}`); }
  return eb;
}
async function endGiveaway(g, reroll) {
  const guild = client.guilds.cache.get(g.gid);
  if (!guild) return;
  const ch = guild.channels.cache.get(g.cid);
  let pool = g.parts.slice();
  if (g.roleReq) pool = pool.filter(id => { const m = guild.members.cache.get(id); return m && m.roles.cache.has(g.roleReq); });
  const wins = [];
  while (wins.length < g.winners && pool.length) wins.push(pool.splice(rnd(0, pool.length - 1), 1)[0]);
  g.ended = true;
  const eb = gwEmbed(g);
  eb.setDescription(`**Odul:** ${g.prize}\n**Kazananlar:** ${wins.length ? wins.map(w => `<@${w}>`).join(', ') : 'Katilimci yok'}\n**Toplam katilimci:** ${g.parts.length}\n> Cekilis sona erdi.`);
  try { const msg = await ch.messages.fetch(g.mid); await msg.edit({ embeds: [eb], components: [] }); } catch (e) {}
  if (wins.length) {
    await ch.send({ content: `${wins.map(w => `<@${w}>`).join(', ')} **Tebrikler! \`${g.prize}\` cekilisini kazandiniz!**` });
    for (const w of wins) {
      const u = await client.users.fetch(w).catch(() => null);
      if (u) dmUser(u, E(0x57F287).setDescription(`> **CEKILIS KAZANDIN**\n**Sunucu:** ${guild.name}\n**Odul:** ${g.prize}\n> Odulunu almak icin sunucuda yetkililerle iletisime gec.`));
    }
  } else await ch.send({ content: '**Cekilis sona erdi:** yeterli katilimci yok.' });
  saveDB();
}

/* ===================== BASVURU (DM butonlu geri-donme) ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('başvuru-sistemi').setDescription('Gelismis basvuru sistemi kurar').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    STATE.set(sKey(i) + ':app', { exp: now() + 900000, kanal: null, log: null, rol: null, metin: null, sorular: [] });
    await i.reply({
      embeds: [E().setTitle('Basvuru Sistemi Kurulumu').setDescription('`1.` Panel & log kanali, kabul rolu sec\n`2.` **Panel Metni** ile embed yazisini ayarla\n`3.` **Soru Ekle** ile sorulari ekle (max 15)\n`4.` **Sistemi Kur** ile bitir')],
      components: [
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:kanal').setPlaceholder('Basvuru panel kanali').setChannelTypes([ChannelType.GuildText])),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:log').setPlaceholder('Basvuru LOG kanali').setChannelTypes([ChannelType.GuildText])),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('app:rol').setPlaceholder('Kabul rolu (istege bagli)').setMinValues(0).setMaxValues(1)),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('app:metin').setLabel('Panel Metni').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('app:addsoru').setLabel('Soru Ekle').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('app:kur').setLabel('Sistemi Kur').setStyle(ButtonStyle.Success))],
      ephemeral: true
    });
  }
});

/* ===================== DM AT ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('dm-at').setDescription('DM uzerinden mesaj gonderir').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    STATE.set(sKey(i) + ':dm', { exp: now() + 600000, target: null, member: null });
    await i.reply({
      embeds: [E().setTitle('DM Gonderim Sistemi').setDescription('> Kime gonderilecegini sec:\n`everyone` → tum uyeler\n`here` → aktif uyeler\n`uye` → ID / mention / **Discord kullanici adi**')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dm:target:everyone').setLabel('Everyone').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dm:target:here').setLabel('Here (Online)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dm:target:uye').setLabel('Belirli Uye').setStyle(ButtonStyle.Secondary))],
      ephemeral: true
    });
  }
});

/* ===================== YARDIM ===================== */
const CATS = {
  moderasyon: [['/ban', 'Uye yasaklar'], ['/unban', 'Ban kaldirir'], ['/kick', 'Uye atar'], ['/mute', 'Sureli susturur'], ['/unmute', 'Susturma kaldirir'], ['/clear', 'Mesaj siler'], ['/warn', 'Uyarir'], ['/uyarilar', 'Uyari listesi'], ['/uyari-sil', 'Uyari siler'], ['/slowmode', 'Yavas mod'], ['/kilitle', 'Kanal kilitler'], ['/kilit-ac', 'Kilit acar'], ['/otorol', 'Oto rol'], ['/guard', 'Kufur/reklam filtresi'], ['/log-kur', 'Modlog kanali']],
  ticket: [['/ticket-kur', 'Kategorili/kategorisiz ticket'], ['/ticket-kur-mequeen', 'Mequeen hazir panel'], ['Panel menusu', 'Kategori secerek ticket acma'], ['Ticket butonlari', 'Kapat + otomatik transcript']],
  duyuru: [['/guncelleme-duyuru', 'Markdown destekli duyuru'], ['/leak-duyuru', 'Sizinti bulteni'], ['Onizleme', 'Kanal/mention secimli onizleme']],
  cekilis: [['/cekilis baslat', 'Sure, odul, tur, rol sarti, ping'], ['/cekilis bitir', 'Erken bitir'], ['/cekilis yeniden', 'Reroll']],
  basvuru: [['/basvuru-sistemi', 'Panel + log + sorular + kabul rolu'], ['Log butonlari', 'Gor / Kabul / Reddet / Beklemeye Al'], ['DM form', 'Butonlu onceki/sonraki soru']],
  dm: [['/dm-at', 'Everyone / Here / Tek uye (ID veya kullanici adi)']],
  ekonomi: [['/robux bakiye', 'Cuzdan + banka + pet + seviye'], ['/robux cash', 'Transfer'], ['/robux gunluk', 'Gunluk R$ (+streak)'], ['/robux calis', 'Is kazanci'], ['/robux ara', 'Rastgele R$'], ['/robux yazitura', 'Coinflip'], ['/robux bahis', 'Zar x2/x10'], ['/robux duel', 'Uye duellosu'], ['/robux yatir / cek', 'Banka'], ['/robux market', 'Magaza'], ['/robux envanter', 'Esyalar'], ['/robux egg', 'Yumurta ac (pet cikar)'], ['/robux pets', 'Pet koleksiyonun'], ['/robux equip', 'Pet kusan (boost verir)'], ['/robux liderler', 'Top 10'], ['/robux bilgi', 'Rehber']],
  genel: [['/yardim', 'Bu menu (DM)'], ['/ping', 'Gecikme'], ['/avatar', 'Profil fotografi'], ['/sunucu-bilgi', 'Sunucu istatistigi'], ['/uye-bilgi', 'Uye karti'], ['/user-count', 'Kilitli sayac kanallari']],
  owner: [['/owner setbalance', 'Uye bakiyesi ayarla'], ['/owner give', 'Kendine sinirsiz R$ ekle'], ['/owner givepet', 'Uyeye pet ver (secilen nadirlik)'], ['/owner resetuser', 'Uye verilerini sifirla'], ['/owner globalmsg', 'Tum sunuculara mesaj at']]
};
function helpEmbed(cat) {
  if (!cat) return E().setTitle('Studioblox Yardim Merkezi').setDescription(`> Asagidaki menuden kategori sec.\n\n**Kategoriler:**\n\`moderasyon\` \`ticket\` \`duyuru\` \`cekilis\` \`basvuru\` \`dm\` \`ekonomi\` \`genel\` \`owner\`\n\n-# Bu mesaj DM uzerinden gonderildi.`);
  return E().setTitle(`Yardim: ${cat.toUpperCase()}`).setDescription(CATS[cat].map(l => `**${l[0]}**\n> ${l[1]}`).join('\n\n'));
}
CMDS.push({
  data: new SlashCommandBuilder().setName('yardım').setDescription('Yardim menusunu DM gonderir'),
  async execute(i) {
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help:cat').setPlaceholder('Kategori sec...')
      .addOptions(Object.keys(CATS).map(k => ({ label: k.toUpperCase(), value: k, description: `${CATS[k].length} komut/ozellik` }))));
    const ok = await dmUser(i.user, { embeds: [helpEmbed(null)], components: [row] });
    if (ok) i.reply({ embeds: [E().setDescription('> **Yardim menusu DM uzerinden bildirildi, kontrol et.**')], ephemeral: true });
    else i.reply({ embeds: [ERR('DM kutun kapali.')], ephemeral: true });
  }
});

/* ===================== USER COUNT ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('user-count').setDescription('Kilitli sayac ses kanallari').setDMPermission(false)
    .addSubcommand(s => s.setName('kur').setDescription('Kur').addStringOption(o => o.setName('dil').setDescription('Dil').setRequired(true).addChoices({ name: 'English', value: 'en' }, { name: 'Turkce', value: 'tr' })))
    .addSubcommand(s => s.setName('kapat').setDescription('Kapat')),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    const g = gconf(i.guild.id);
    if (i.options.getSubcommand() === 'kapat') {
      if (g.usercount.categoryId) { const c = i.guild.channels.cache.get(g.usercount.categoryId); if (c) await c.delete().catch(() => {}); }
      g.usercount = { enabled: false, lang: 'en', categoryId: null, ch1: null, ch2: null };
      return i.reply({ embeds: [OKC('Sayac kanallari silindi.')], ephemeral: true });
    }
    const lang = i.options.getString('dil');
    const cat = await i.guild.channels.create({
      name: lang === 'tr' ? 'ISTATISTIK' : 'STATISTICS', type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }]
    });
    await cat.setPosition(0).catch(() => {});
    const mk = async (name) => i.guild.channels.create({
      name, type: ChannelType.GuildVoice, parent: cat.id, userLimit: 0,
      permissionOverwrites: [
        { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }]
    });
    const c1 = await mk(lang === 'tr' ? 'Uye Sayisi: 0' : 'Member Count: 0');
    const c2 = await mk(lang === 'tr' ? 'Bot Sayisi: 0' : 'Bot Count: 0');
    g.usercount = { enabled: true, lang, categoryId: cat.id, ch1: c1.id, ch2: c2.id };
    await updateUC(i.guild);
    i.reply({ embeds: [OKC('Sayac kanallari en uste kuruldu ve herkese **kilitli** (yonetici haric).')], ephemeral: true });
  }
});
async function updateUC(guild) {
  const g = gconf(guild.id);
  if (!g.usercount.enabled) return;
  const all = guild.members.cache;
  const bots = all.filter(m => m.user.bot).size;
  const humans = all.size - bots;
  const c1 = guild.channels.cache.get(g.usercount.ch1);
  const c2 = guild.channels.cache.get(g.usercount.ch2);
  if (!c1 || !c2) { g.usercount.enabled = false; return; }
  const n1 = g.usercount.lang === 'tr' ? `Uye Sayisi: ${humans}` : `Member Count: ${humans}`;
  const n2 = g.usercount.lang === 'tr' ? `Bot Sayisi: ${bots}` : `Bot Count: ${bots}`;
  if (c1.name !== n1) await c1.setName(n1).catch(() => {});
  if (c2.name !== n2) await c2.setName(n2).catch(() => {});
}

/* ===================== ROBUX (GENISLETILMIS: PET + STREAK + XP) ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('robux').setDescription('Robux ekonomi sistemi')
    .addSubcommand(s => s.setName('bakiye').setDescription('Detayli bakiye profili').addUserOption(o => o.setName('uye').setDescription('Uye')))
    .addSubcommand(s => s.setName('cash').setDescription('R$ gonder').addUserOption(o => o.setName('uye').setDescription('Alici').setRequired(true)).addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('gunluk').setDescription('Gunluk odul (streak bonusu)'))
    .addSubcommand(s => s.setName('calis').setDescription('Isten kazan'))
    .addSubcommand(s => s.setName('ara').setDescription('R$ bul'))
    .addSubcommand(s => s.setName('yazitura').setDescription('Coinflip').addStringOption(o => o.setName('tahmin').setDescription('Tahmin').setRequired(true).addChoices({ name: 'Yazi', value: 'yazi' }, { name: 'Tura', value: 'tura' })).addIntegerOption(o => o.setName('miktar').setDescription('Bahis').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('bahis').setDescription('Zar bahsi').addIntegerOption(o => o.setName('miktar').setDescription('Bahis').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('duel').setDescription('Duello').addUserOption(o => o.setName('uye').setDescription('Rakip').setRequired(true)).addIntegerOption(o => o.setName('miktar').setDescription('Bahis').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('yatir').setDescription('Bankaya yatir').addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('cek').setDescription('Bankadan cek').addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('market').setDescription('Magaza (yumurta dahil)'))
    .addSubcommand(s => s.setName('envanter').setDescription('Esyalar'))
    .addSubcommand(s => s.setName('egg').setDescription('Yumurta ac (pet cikar)').addStringOption(o => o.setName('tur').setDescription('Yumurta turu').setRequired(true).addChoices({ name: 'Normal (500 R$)', value: 'egg_normal' }, { name: 'Premium (2500 R$)', value: 'egg_premium' }, { name: 'Mystic (15000 R$)', value: 'egg_mystic' })))
    .addSubcommand(s => s.setName('pets').setDescription('Pet koleksiyonun').addUserOption(o => o.setName('uye').setDescription('Uye')))
    .addSubcommand(s => s.setName('equip').setDescription('Pet kus/ac').addStringOption(o => o.setName('id').setDescription('Pet ID').setRequired(true)))
    .addSubcommand(s => s.setName('liderler').setDescription('Top 10'))
    .addSubcommand(s => s.setName('bilgi').setDescription('Rehber')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const u = uconf(i.user.id);
    const ownerBadge = isOwner(i.user) ? '👑 **OWNER**' : '';
    if (sub === 'bakiye') {
      const t = i.options.getUser('uye') || i.user;
      const tu = uconf(t.id);
      const eq = tu.pets.filter(p => p.equipped);
      const eqText = eq.length ? eq.map(p => `${p.emoji} ${p.name} (${RARITIES[p.rarity].label})`).join(', ') : 'yok';
      const total = tu.balance + tu.bank;
      const eb = E(isOwner(t) ? 0xF1C40F : 0x57F287).setTitle('BAKIYE KARTI').setThumbnail(t.displayAvatarURL())
        .setDescription(`**Uye:** ${t.tag} ${ownerBadge}\n**Cuzdan:** ${balF(tu.balance)}\n**Banka:** ${balF(tu.bank)}\n**Toplam:** ${balF(total)}\n**Seviye:** ${tu.level} (XP: ${tu.xp}/${xpForLevel(tu.level)})\n**Streak:** ${tu.streak} gun\n**Kusanilan Pet:** ${eqText}\n**Pet Boost:** +${petBoostTotal(t.id)} R$ / kazanc\n**Envanter:** ${tu.inv.length} esya${tu.badges.includes('vip') ? '\n**Rozet:** VIP' : ''}`);
      return i.reply({ embeds: [eb] });
    }
    if (sub === 'cash') {
      const t = i.options.getUser('uye'); const m = i.options.getInteger('miktar');
      if (t.bot) return i.reply({ embeds: [ERR('Botlara transfer yapilamaz.')], ephemeral: true });
      if (u.balance < m) return i.reply({ embeds: [ERR(`Yetersiz bakiye. Cuzdan: ${balF(u.balance)}`)], ephemeral: true });
      u.balance -= m; uconf(t.id).balance += m;
      addXP(i.user.id, 5);
      dmUser(t, E(0x57F287).setDescription(`> **TRANSFER**\n**Gonderen:** ${i.user.tag}\n**Miktar:** ${balF(m)}`));
      return i.reply({ embeds: [OKC(`${t.tag} uyesine ${balF(m)} gonderildi. (+5 XP)`)] });
    }
    if (sub === 'gunluk') {
      if (u.cd.daily > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.daily - now())}**`)], ephemeral: true });
      /* streak kontrolu */
      const yesterday = now() - 86400000;
      if (u.lastDaily > yesterday && u.lastDaily < now() - 3600000) { u.streak++; }
      else if (u.lastDaily < yesterday) { u.streak = 1; }
      else if (u.lastDaily === 0) { u.streak = 1; }
      const streakBonus = Math.min(u.streak * 10, 200); /* max +200 */
      let kaz = (250 + streakBonus) * boostMul(i.user);
      kaz = Math.floor(kaz);
      u.balance += kaz; u.cd.daily = now() + 86400000; u.lastDaily = now();
      addXP(i.user.id, 20);
      return i.reply({ embeds: [OKC(`Gunluk odul: ${balF(kaz)}\n> Streak: **${u.streak} gun** (+${streakBonus} R$ bonus)\n> Pet boost aktif: +${petBoostTotal(i.user.id)} R$`) ] });
    }
    if (sub === 'calis') {
      if (u.cd.work > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.work - now())}**`)], ephemeral: true });
      const kaz = Math.floor(rnd(100, 400) * boostMul(i.user));
      u.balance += kaz; u.cd.work = now() + 3600000;
      addXP(i.user.id, 15);
      return i.reply({ embeds: [OKC(`**${pick(JOBS)}** olarak calistin, ${balF(kaz)} kazandin. (+15 XP)`)] });
    }
    if (sub === 'ara') {
      if (u.cd.ara > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.ara - now())}**`)], ephemeral: true });
      let kaz;
      const si = u.inv.findIndex(x => x.id === 'sans');
      if (si > -1) { kaz = rnd(150, 300); u.inv.splice(si, 1); } else kaz = rnd(15, 120) * boostMul(i.user);
      kaz = Math.floor(kaz);
      u.balance += kaz; u.cd.ara = now() + 1800000;
      addXP(i.user.id, 10);
      const extra = Math.random() < 0.05 ? (u.inv.push({ id: 'vip_parca' }), '\n> Nadir parca buldun!') : '';
      return i.reply({ embeds: [OKC(`Aramada ${balF(kaz)} buldun.${extra} (+10 XP)`)] });
    }
    if (sub === 'yazitura') {
      const m = i.options.getInteger('miktar'); const t = i.options.getString('tahmin');
      if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true });
      const sonuc = Math.random() < 0.5 ? 'yazi' : 'tura';
      if (sonuc === t) { u.balance += m; addXP(i.user.id, 8); return i.reply({ embeds: [OKC(`Yazi tura: **${sonuc}** → Kazandin ${balF(m)}!`)] }); }
      u.balance -= m;
      return i.reply({ embeds: [ERR(`Yazi tura: **${sonuc}** → Kaybettin ${balF(m)}.`)] });
    }
    if (sub === 'bahis') {
      const m = i.options.getInteger('miktar');
      if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true });
      const r = rnd(1, 100);
      if (r === 100) { u.balance += m * 9; addXP(i.user.id, 50); return i.reply({ embeds: [OKC(`JACKPOT! Zar **${r}** → x10 (${balF(m * 10)})`)] }); }
      if (r >= 50) { u.balance += m; addXP(i.user.id, 15); return i.reply({ embeds: [OKC(`Zar **${r}** → x2 (${balF(m * 2)})`)] }); }
      u.balance -= m;
      return i.reply({ embeds: [ERR(`Zar **${r}** → Kaybettin ${balF(m)}.`)] });
    }
    if (sub === 'duel') {
      const t = i.options.getMember('uye'); const m = i.options.getInteger('miktar');
      if (!t || t.user.bot || t.id === i.user.id) return i.reply({ embeds: [ERR('Gecersiz rakip.')], ephemeral: true });
      if (u.balance < m || uconf(t.id).balance < m) return i.reply({ embeds: [ERR('Bakiye yetersiz (sen veya rakip).')], ephemeral: true });
      const id = rnd(100000, 999999);
      STATE.set('duel:' + id, { exp: now() + 60000, from: i.user.id, to: t.id, amt: m });
      return i.reply({
        embeds: [E(0xFEE75C).setTitle('DUELLO').setDescription(`**${i.user.tag}** vs **${t.user.tag}**\n**Bahis:** ${balF(m)}\n> ${t} kabul etmek icin butona bas. (60 sn)`)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`duel:accept:${id}`).setLabel('Kabul Et').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`duel:decline:${id}`).setLabel('Reddet').setStyle(ButtonStyle.Danger))]
      });
    }
    if (sub === 'yatir') { const m = i.options.getInteger('miktar'); if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true }); u.balance -= m; u.bank += m; return i.reply({ embeds: [OKC(`Bankaya ${balF(m)} yatirildi.`)] }); }
    if (sub === 'cek') { const m = i.options.getInteger('miktar'); if (u.bank < m) return i.reply({ embeds: [ERR('Bankada yeterli yok.')], ephemeral: true }); u.bank -= m; u.balance += m; return i.reply({ embeds: [OKC(`Bankadan ${balF(m)} cekildi.`)] }); }
    if (sub === 'market') {
      const rows = [];
      for (let x = 0; x < SHOP.length; x += 5) rows.push(new ActionRowBuilder().addComponents(SHOP.slice(x, x + 5).map(it =>
        new ButtonBuilder().setCustomId(`shop:buy:${it.id}`).setLabel(`${it.name.split(' (')[0]} — R$ ${it.price}`).setStyle(ButtonStyle.Secondary))));
      return i.reply({ embeds: [E(0x5865F2).setTitle('ROBUX MARKET').setDescription(SHOP.map(it => `**${it.name}** — ${balF(it.price)}\n> ${it.desc}`).join('\n\n'))], components: rows, ephemeral: true });
    }
    if (sub === 'envanter') return i.reply({ embeds: [E().setTitle('ENVANTER').setDescription(u.inv.length ? u.inv.map(x => { const it = SHOP.find(s => s.id === x.id); return `**${it ? it.name : x.id}**${x.until ? ` (kalan: ${fmtDur(x.until - now())})` : ''}`; }).join('\n') : '> Envanterin bos.')], ephemeral: true });
    if (sub === 'egg') {
      const tur = i.options.getString('tur');
      const it = SHOP.find(s => s.id === tur);
      if (u.balance < it.price) return i.reply({ embeds: [ERR(`Yetersiz bakiye. Gerekli: ${balF(it.price)}, senin: ${balF(u.balance)}`)], ephemeral: true });
      u.balance -= it.price;
      const pet = rollPet(tur);
      u.pets.push(pet);
      addXP(i.user.id, 30);
      const rarityColor = RARITIES[pet.rarity].color;
      return i.reply({ embeds: [E(rarityColor).setTitle('YUMURTA ACILDI!').setDescription(`**${pet.emoji} ${pet.name}**\n**Nadirlik:** ${RARITIES[pet.rarity].label}\n**Boost:** +${pet.boost} R$ / kazanc\n\n> \`/robux equip id:${pet.id}\` ile kusan ve boost aktif et.`)] });
    }
    if (sub === 'pets') {
      const t = i.options.getUser('uye') || i.user;
      const tu = uconf(t.id);
      if (!tu.pets.length) return i.reply({ embeds: [E().setTitle('PET KOLEKSIYONU').setDescription('> Henuz petin yok. `/robux egg` ile yumurta ac!')] });
      const byRarity = Object.keys(RARITIES).reverse();
      const lines = [];
      for (const r of byRarity) {
        const pets = tu.pets.filter(p => p.rarity === r);
        if (pets.length) {
          lines.push(`**${RARITIES[r].label}:**\n${pets.map(p => `${p.emoji} ${p.name} ${p.equipped ? '(KUSANILMIS)' : ''} — \`id:${p.id}\``).join('\n')}`);
        }
      }
      return i.reply({ embeds: [E(0x9B59B6).setTitle(`${t.tag} — Pet Koleksiyonu`).setDescription(lines.join('\n\n') + `\n\n-# Toplam: ${tu.pets.length} pet • Kusanilan: ${tu.pets.filter(p=>p.equipped).length}`)] });
    }
    if (sub === 'equip') {
      const pid = i.options.getString('id');
      const pet = u.pets.find(p => p.id === pid);
      if (!pet) return i.reply({ embeds: [ERR('Bu ID ile pet bulunamadi.')], ephemeral: true });
      if (pet.equipped) { pet.equipped = false; return i.reply({ embeds: [OKC(`${pet.emoji} ${pet.name} kusanimdan cikarildi.`)] }); }
      /* max 3 pet kusanilabilir */
      const equipped = u.pets.filter(p => p.equipped);
      if (equipped.length >= 3) return i.reply({ embeds: [ERR('Ayni anda en fazla **3 pet** kusanabilirsin. Birini cikar ve tekrar dene.')], ephemeral: true });
      pet.equipped = true;
      return i.reply({ embeds: [OKC(`${pet.emoji} ${pet.name} kusanildi! Kazancina +${pet.boost} R$ boost eklendi.`)] });
    }
    if (sub === 'liderler') {
      const top = Object.entries(DB.users).sort((a, b) => (b[1].balance + b[1].bank) - (a[1].balance + a[1].bank)).slice(0, 10);
      return i.reply({ embeds: [E(0xFEE75C).setTitle('ROBUX LIDERLERI').setDescription(top.map((t, x) => `**${x + 1}.** <@${t[0]}> — ${balF(t[1].balance + t[1].bank)}`).join('\n') || '> Veri yok.')] });
    }
    if (sub === 'bilgi') return i.reply({ embeds: [E(0x57F287).setTitle('ROBUX EKONOMI REHBERI').setDescription('> **Para birimi:** Robux (R$)\n\n**Kazanma:**\n`/robux gunluk` → 24 saatte 250 R$ + streak bonusu\n`/robux calis` → saatlik is\n`/robux ara` → 30 dk\'da rastgele R$\n\n**Oyunlar:**\n`/robux yazitura` → coinflip\n`/robux bahis` → zar: 1-49 kaybet, 50-99 x2, 100 x10\n`/robux duel` → uye duellosu\n\n**Pet Sistemi:**\n`/robux egg` → yumurta ac (COMMON → MYSTIC)\n`/robux pets` → koleksiyonun\n`/robux equip` → kusan (max 3) — kazanc boost\'u verir\n\n**Seviye:** Her islem XP verir, seviye atlayinca bonus!\n\n**Streak:** Her gun gunluk aldikca +10 R$ bonus (max +200).') ] });
  }
});

/* ---------- GENEL ---------- */
CMDS.push({ data: new SlashCommandBuilder().setName('ping').setDescription('Gecikme'), async execute(i) { i.reply({ embeds: [E().setDescription(`> **PONG**\nGateway: **${client.ws.ping}ms**`)] }); } });
CMDS.push({
  data: new SlashCommandBuilder().setName('avatar').setDescription('Profil fotografi').addUserOption(o => o.setName('uye').setDescription('Uye')),
  async execute(i) { const t = i.options.getUser('uye') || i.user; i.reply({ embeds: [E().setTitle(`${t.tag}`).setImage(t.displayAvatarURL({ size: 512 }))] }); }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('sunucu-bilgi').setDescription('Sunucu bilgisi').setDMPermission(false),
  async execute(i) {
    const g = i.guild;
    const bots = g.members.cache.filter(m => m.user.bot).size;
    i.reply({ embeds: [E().setTitle('SUNUCU BILGISI').setThumbnail(g.iconURL() || null).setDescription(`**Ad:** ${g.name}\n**Kurulus:** <t:${Math.floor(g.createdTimestamp / 1000)}:f>\n**Uye:** ${g.memberCount - bots} (+${bots} bot)\n**Kanal:** ${g.channels.cache.size}\n**Rol:** ${g.roles.cache.size}\n**Sahip:** <@${g.ownerId}>`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('üye-bilgi').setDescription('Uye karti').addUserOption(o => o.setName('uye').setDescription('Uye')),
  async execute(i) {
    const t = i.options.getMember('uye') || i.member;
    i.reply({ embeds: [E().setTitle('UYE KARTI').setThumbnail(t.user.displayAvatarURL()).setDescription(`**Ad:** ${t.user.tag}\n**Katilim:** <t:${Math.floor(t.joinedTimestamp / 1000)}:f>\n**Hesap:** <t:${Math.floor(t.user.createdTimestamp / 1000)}:f>\n**Rol:** ${t.roles.cache.filter(r => r.id !== i.guild.id).size}`)] });
  }
});

/* ===================== TICKET FONKSIYONLARI ===================== */
async function createTicket(i, reasonLabel) {
  const conf = gconf(i.guild.id).ticket;
  if (!conf) return i.reply({ embeds: [ERR('Ticket sistemi kurulu degil.')], ephemeral: true });
  const existing = Object.values(DB.tickets).find(t => t.guild === i.guild.id && t.owner === i.user.id && !t.closed);
  if (existing) return i.reply({ embeds: [ERR(`Zaten bir ticketin var: <#${existing.ch}>`)], ephemeral: true });
  let cat = i.guild.channels.cache.get(conf.categoryId);
  if (!cat) {
    cat = await i.guild.channels.create({ name: 'TICKETS', type: ChannelType.GuildCategory, permissionOverwrites: [{ id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }] });
    conf.categoryId = cat.id;
  }
  const perms = [
    { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
  ];
  for (const r of conf.roles || []) perms.push({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  const ch = await i.guild.channels.create({
    name: (`ticket-${i.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90)) || `ticket-${i.user.id}`,
    type: ChannelType.GuildText, parent: cat.id, topic: `Ticket: ${i.user.tag} | ${reasonLabel}`, permissionOverwrites: perms
  });
  DB.tickets[ch.id] = { guild: i.guild.id, owner: i.user.id, reason: reasonLabel, created: now(), closed: false };
  const eb = E().setTitle('TICKET').setDescription(`${conf.text || 'Yetkililer en kisa surede ilgilenecek.'}\n\n**Sebep:** ${reasonLabel}\n**Sahip:** ${i.user}`);
  if (conf.thumb && conf.thumb.startsWith('http')) eb.setThumbnail(conf.thumb);
  const content = [i.user.toString(), ...(conf.roles || []).map(r => `<@&${r}>`)].join(' ');
  await ch.send({ content, embeds: [eb], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk:kapat').setLabel('Ticketi Kapat').setStyle(ButtonStyle.Danger))] });
  await i.reply({ embeds: [OKC(`Ticket olusturuldu: ${ch}`)], ephemeral: true });
  saveDB();
}
async function closeTicket(i) {
  const t = DB.tickets[i.channel.id];
  if (!t) return;
  t.closed = true;
  const msgs = await i.channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (msgs) {
    const txt = msgs.reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString('tr-TR')}] ${m.author.tag}: ${m.content || '(embed/ek)'}`).join('\n');
    const att = new AttachmentBuilder(Buffer.from(txt, 'utf8'), { name: `transcript-${i.channel.name}.txt` });
    const logCh = i.guild.channels.cache.get(gconf(i.guild.id).modlog);
    if (logCh) await logCh.send({ content: `**Ticket Transcript** — <@${t.owner}> | Sebep: ${t.reason}`, files: [att] }).catch(() => {});
  }
  delete DB.tickets[i.channel.id];
  saveDB();
  await i.channel.delete('Ticket kapatildi').catch(() => {});
}
async function finalizeTicket(i, st, cats) {
  const ch = i.guild.channels.cache.get(st.kanal);
  if (!ch) return refresh(i, { embeds: [ERR('Kanal bulunamadi.')], components: [] });
  gconf(i.guild.id).ticket = { mode: st.mode, channel: st.kanal, roles: st.roller || [], thumb: st.thumb, text: st.metin, cats, categoryId: null };
  const eb = E().setTitle('HELP & SUPPORT').setDescription(st.metin);
  if (st.thumb && st.thumb.startsWith('http')) eb.setThumbnail(st.thumb);
  const comps = [];
  if (st.mode === 'kategorili' && cats.length) comps.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tk:secim').setPlaceholder('Ticket kategorisi sec...').addOptions(cats.map(c => ({ label: c, value: c })))));
  else comps.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tkpanel:create').setLabel('Ticket Olustur').setStyle(ButtonStyle.Primary)));
  await ch.send({ embeds: [eb], components: comps });
  STATE.delete(sKey(i) + ':tk');
  return refresh(i, { embeds: [OKC(`Ticket paneli kuruldu: ${ch}`)], components: [] });
}

/* ===================== BASVURU DM (butonlu geri-donme) ===================== */
async function appLogEmbed(a) {
  const renk = a.status === 'KABUL' ? 0x57F287 : a.status === 'RED' ? 0xED4245 : a.status === 'INCELEMEDE' ? 0xFEE75C : 0x5865F2;
  return E(renk).setTitle(`YENI BASVURU #${a.id}`).setDescription(`**Basvuran:** <@${a.user}> (${a.user})\n**Tarih:** <t:${Math.floor(a.time / 1000)}:f>\n**Durum:** \`${a.status}\`\n**Soru sayisi:** ${a.qa.length}\n\n> Icerigi gormek icin **Basvuruyu Gor** (yalnizca yonetici)`);
}
async function appLogUpdate(i, a) {
  try { await i.message.edit({ embeds: [appLogEmbed(a)], components: [i.message.components[0]] }); } catch (e) {}
  saveDB();
}
async function appSetupUpdate(i) {
  const st = STATE.get(sKey(i) + ':app');
  const rows = [
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:kanal').setPlaceholder('Panel kanali').setChannelTypes([ChannelType.GuildText])),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:log').setPlaceholder('Log kanali').setChannelTypes([ChannelType.GuildText])),
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('app:rol').setPlaceholder('Kabul rolu (istege bagli)').setMinValues(0).setMaxValues(1)),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app:metin').setLabel('Panel Metni').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('app:addsoru').setLabel('Soru Ekle').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('app:kur').setLabel('Sistemi Kur').setStyle(ButtonStyle.Success))
  ];
  if (st.sorular.length) {
    const btns = st.sorular.map((s, x) => new ButtonBuilder().setCustomId(`app:sorusil:${x}`).setLabel(`X ${x + 1}. ${s.slice(0, 20)}`).setStyle(ButtonStyle.Danger));
    for (let x = 0; x < btns.length; x += 5) rows.push(new ActionRowBuilder().addComponents(btns.slice(x, x + 5)));
  }
  return refresh(i, {
    embeds: [E().setTitle('Basvuru Kurulum').setDescription(`**Panel:** ${st.kanal ? `<#${st.kanal}>` : 'X'}\n**Log:** ${st.log ? `<#${st.log}>` : 'X'}\n**Kabul rolu:** ${st.rol ? `<@&${st.rol}>` : '—'}\n**Metin:** ${st.metin ? 'OK' : 'X'}\n**Sorular (${st.sorular.length}):**\n${st.sorular.map((s, x) => `> \`{${x + 1}}\` ${s}`).join('\n') || '> yok'}`)],
    components: rows
  });
}

/* DM tabanli butonlu basvuru formu */
async function runAppFormDM(user, conf, guild) {
  const dm = await user.createDM();
  const answers = new Array(conf.sorular.length).fill('');
  let current = 0;
  const intro = await dm.send({ embeds: [E().setTitle('Basvuru Formu').setDescription(`> ${conf.sorular.length} soruya cevap vereceksin.\n> Her sorudan sonra **onceki soruya donebilir** veya **iptal** edebilirsin.\n\n**Baslamak icin** asagidaki butona bas.`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app:dm:start').setLabel('Basla').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('app:dm:cancel').setLabel('Iptal').setStyle(ButtonStyle.Danger))]
  });
  const startClick = await intro.awaitMessageComponent({ filter: c => c.user.id === user.id, time: 120000 }).catch(() => null);
  if (!startClick) { await dm.send({ embeds: [ERR('Sure doldu, basvuru iptal.')] }).catch(()=>{}); return null; }
  if (startClick.customId === 'app:dm:cancel') { await startClick.update({ embeds: [ERR('Basvuru iptal edildi.')], components: [] }); return null; }
  await startClick.update({ embeds: [E().setDescription('> Basladi! Sorular DM\'den akacak.')], components: [] });

  while (current < conf.sorular.length) {
    const questionNum = current + 1;
    const soru = conf.sorular[current];
    const rows = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app:dm:prev').setLabel('◀ Onceki Soru').setStyle(ButtonStyle.Secondary).setDisabled(current === 0),
      new ButtonBuilder().setCustomId('app:dm:cancel').setLabel('Iptal').setStyle(ButtonStyle.Danger))];
    const existing = answers[current];
    const qMsg = await dm.send({
      embeds: [E().setTitle(`Soru ${questionNum}/${conf.sorular.length}`).setDescription(`**${soru}**\n\n> Cevabini bu kanala yaz.${existing ? `\n\n-# Mevcut cevap: ${existing.slice(0, 100)}${existing.length > 100 ? '...' : ''}` : ''}`)],
      components: rows
    });
    const collector = qMsg.createMessageComponentCollector({ filter: c => c.user.id === user.id, time: 300000 });
    const msgCollector = dm.createMessageCollector({ filter: m => m.author.id === user.id, time: 300000 });

    let action = null;
    const result = await new Promise((resolve) => {
      collector.on('collect', async c => {
        collector.stop(); msgCollector.stop();
        await c.deferUpdate().catch(()=>{});
        resolve({ action: c.customId });
      });
      msgCollector.on('collect', async m => {
        collector.stop(); msgCollector.stop();
        m.delete().catch(()=>{});
        resolve({ action: 'answer', text: m.content.trim() });
      });
      collector.on('end', (_, reason) => { if (reason === 'time') resolve({ action: 'timeout' }); });
      msgCollector.on('end', (_, reason) => { if (reason === 'time') resolve({ action: 'timeout' }); });
    });

    if (!result || result.action === 'timeout') {
      await dm.send({ embeds: [ERR('Sure doldu, basvuru iptal.')] }).catch(()=>{});
      return null;
    }
    if (result.action === 'app:dm:cancel') {
      await dm.send({ embeds: [ERR('Basvuru iptal edildi.')] }).catch(()=>{});
      return null;
    }
    if (result.action === 'app:dm:prev') {
      current = Math.max(0, current - 1);
      continue;
    }
    if (result.action === 'answer') {
      answers[current] = result.text;
      current++;
    }
  }

  const confirm = await dm.send({
    embeds: [E().setTitle('Basvuru Onayi').setDescription(`> Tum sorular cevaplandi.\n\n**Ozet:**\n${answers.map((a, x) => `**${x + 1}.** ${conf.sorular[x]}\n> ${a}`).join('\n\n')}`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app:dm:submit').setLabel('Gonder').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('app:dm:edit').setLabel('Duzenle').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('app:dm:cancel').setLabel('Iptal').setStyle(ButtonStyle.Danger))]
  });
  const confirmClick = await confirm.awaitMessageComponent({ filter: c => c.user.id === user.id, time: 300000 }).catch(() => null);
  if (!confirmClick || confirmClick.customId === 'app:dm:cancel') {
    await confirm.edit({ embeds: [ERR('Basvuru iptal edildi.')], components: [] }).catch(()=>{});
    return null;
  }
  if (confirmClick.customId === 'app:dm:edit') {
    await confirmClick.update({ embeds: [E().setDescription('> Duzenleme modu. Basamak basamak yeniden sorulacak.')], components: [] });
    current = 0;
    /* yukaridaki while dongusunu tekrar calistir — ic ice gitmesin diye rekursif cagri */
    return runAppFormDM_continue(user, conf, answers, 0);
  }
  await confirmClick.update({ embeds: [OKC('Basvurun alindi!'), ], components: [] });
  return answers;
}

async function runAppFormDM_continue(user, conf, answers, startFrom) {
  const dm = await user.createDM();
  let current = startFrom;
  while (current < conf.sorular.length) {
    const questionNum = current + 1;
    const soru = conf.sorular[current];
    const existing = answers[current];
    const rows = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app:dm:prev').setLabel('◀ Onceki Soru').setStyle(ButtonStyle.Secondary).setDisabled(current === 0),
      new ButtonBuilder().setCustomId('app:dm:cancel').setLabel('Iptal').setStyle(ButtonStyle.Danger))];
    const qMsg = await dm.send({
      embeds: [E().setTitle(`Soru ${questionNum}/${conf.sorular.length}`).setDescription(`**${soru}**${existing ? `\n\n-# Mevcut cevap: ${existing.slice(0, 100)}` : ''}`)],
      components: rows
    });
    const collector = qMsg.createMessageComponentCollector({ filter: c => c.user.id === user.id, time: 300000 });
    const msgCollector = dm.createMessageCollector({ filter: m => m.author.id === user.id, time: 300000 });
    const result = await new Promise((resolve) => {
      collector.on('collect', async c => { collector.stop(); msgCollector.stop(); await c.deferUpdate().catch(()=>{}); resolve({ action: c.customId }); });
      msgCollector.on('collect', async m => { collector.stop(); msgCollector.stop(); m.delete().catch(()=>{}); resolve({ action: 'answer', text: m.content.trim() }); });
      collector.on('end', (_, reason) => { if (reason === 'time') resolve({ action: 'timeout' }); });
      msgCollector.on('end', (_, reason) => { if (reason === 'time') resolve({ action: 'timeout' }); });
    });
    if (!result || result.action === 'timeout' || result.action === 'app:dm:cancel') return null;
    if (result.action === 'app:dm:prev') { current = Math.max(0, current - 1); continue; }
    if (result.action === 'answer') { answers[current] = result.text; current++; }
  }
  return answers;
}

/* ===================== ETKILESIM ===================== */
client.on('interactionCreate', async (i) => {
  try {
    if (i.isChatInputCommand()) {
      const c = CMDS.find(c => c.data.name === i.commandName);
      if (c) return await c.execute(i);
      return;
    }
    if (i.isButton()) {
      const id = i.customId;
      if (id === 'tk:iptal') { STATE.delete(sKey(i) + ':tk'); STATE.delete(sKey(i) + ':mq'); return refresh(i, { embeds: [ERR('Kurulum iptal edildi.')], components: [] }); }
      if (id.startsWith('tk:mode:')) {
        const st = STATE.get(sKey(i) + ':tk') || {};
        st.mode = id.split(':')[2]; st.exp = now() + 900000;
        STATE.set(sKey(i) + ':tk', st);
        return refresh(i, {
          embeds: [E().setTitle('Ticket Kurulum — Adim 2').setDescription(`Tip: **${st.mode === 'kategorili' ? 'Kategorili' : 'Kategorisiz'}**\n> Panel kanali ve rolleri sec, sonra **Devam**.`)],
          components: [
            new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('tk:kanal').setPlaceholder('Panel kanali').setChannelTypes([ChannelType.GuildText])),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('tk:rol').setPlaceholder('Etiket roller (istege bagli)').setMinValues(0).setMaxValues(5)),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('tk:devam').setLabel('Devam →').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('tk:iptal').setLabel('Iptal').setStyle(ButtonStyle.Danger))]
        });
      }
      if (id === 'tk:devam') {
        const st = STATE.get(sKey(i) + ':tk');
        if (!st || !st.kanal) return refresh(i, { embeds: [ERR('Once panel kanali sec.')], components: [] });
        await i.deferUpdate().catch(() => {});
        const thumb = await collectChannel(i, '> **1/2 THUMBNAIL** — Panel ustu gorsel URL yaz (yoksa `-`):');
        if (thumb === null) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.thumb = thumb === '-' ? null : thumb;
        const metin = await collectChannel(i, '> **2/2 PANEL MESAJI** — Ticket panel aciklamasini yaz:');
        if (!metin) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.metin = metin;
        if (st.mode === 'kategorili') {
          const kats = await collectChannel(i, '> **KATEGORILER** — Her satira 1 kategori yaz (max 10):');
          if (!kats) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
          st.cats = kats.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 10);
        } else st.cats = [];
        STATE.set(sKey(i) + ':tk', st);
        return finalizeTicket(i, st, st.cats || []);
      }
      if (id === 'tkpanel:create') return createTicket(i, 'Genel Destek');
      if (id === 'tk:kapat') return i.reply({
        embeds: [E(0xED4245).setDescription('> **Ticket kapatilsin mi?**\nTranscript otomatik log kanalina gider.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('tk:kapat:onay').setLabel('Evet, Kapat').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('tk:kapat:vaz').setLabel('Vazgec').setStyle(ButtonStyle.Secondary))],
        ephemeral: true
      });
      if (id === 'tk:kapat:vaz') return i.update({ embeds: [OKC('Kapatma iptal edildi.')], components: [] });
      if (id === 'tk:kapat:onay') { await i.update({ embeds: [OKC('Ticket kapatiliyor...')], components: [] }); return closeTicket(i); }
      if (id === 'mq:kur') {
        const st = STATE.get(sKey(i) + ':mq');
        if (!st || !st.kanal) return refresh(i, { embeds: [ERR('Once panel kanali sec.')], components: [] });
        const ch = i.guild.channels.cache.get(st.kanal);
        gconf(i.guild.id).ticket = { mode: 'kategorili', channel: st.kanal, roles: st.roller || [], thumb: CONFIG.mequeenBanner, text: MEQUEEN_TEXT, cats: MEQUEEN_CATS, categoryId: null };
        const eb = E().setTitle('MEQUEEN STUDIO — HELP & SUPPORT').setDescription(MEQUEEN_TEXT);
        if (CONFIG.mequeenBanner && CONFIG.mequeenBanner.startsWith('http')) eb.setThumbnail(CONFIG.mequeenBanner);
        await ch.send({ embeds: [eb], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tk:secim').setPlaceholder('Ticket kategorisi sec...').addOptions(MEQUEEN_CATS.map(c => ({ label: c, value: c }))))] });
        STATE.delete(sKey(i) + ':mq');
        return refresh(i, { embeds: [OKC(`Mequeen ticket paneli kuruldu: ${ch}`)], components: [] });
      }
      if (id === 'ann:gonder') {
        const st = STATE.get(sKey(i) + ':ann');
        if (!st) return i.update({ embeds: [ERR('Oturum zaman asimi.')], components: [] });
        const ch = i.guild.channels.cache.get(st.kanal || i.channel.id);
        if (!ch) return i.update({ embeds: [ERR('Kanal bulunamadi.')], components: [] });
        let content = '';
        if (st.mention === 'everyone') content = '@everyone';
        if (st.mention === 'here') content = '@here';
        if (st.mention === 'rol' && st.rol) content = `<@&${st.rol}>`;
        await ch.send({ content, embeds: [annEmbed(st, i.user)] });
        STATE.delete(sKey(i) + ':ann');
        return i.update({ embeds: [OKC(`Duyuru gonderildi: ${ch}`)], components: [] });
      }
      if (id === 'ann:iptal') { STATE.delete(sKey(i) + ':ann'); return i.update({ embeds: [ERR('Duyuru iptal edildi.')], components: [] }); }
      if (id.startsWith('gw:join:')) {
        const g = DB.giveaways[id.split(':')[2]];
        if (!g || g.ended) return i.reply({ embeds: [ERR('Cekilis aktif degil.')], ephemeral: true });
        if (g.roleReq && !i.member.roles.cache.has(g.roleReq)) return i.reply({ embeds: [ERR(`Bu cekilis icin <@&${g.roleReq}> rolu gerekli.`)], ephemeral: true });
        const idx = g.parts.indexOf(i.user.id);
        if (idx > -1) { g.parts.splice(idx, 1); return i.reply({ embeds: [ERR('Katilimin geri cekildi.')], ephemeral: true }); }
        g.parts.push(i.user.id);
        return i.reply({ embeds: [OKC('Cekilise katildin!')], ephemeral: true });
      }
      if (id === 'gw:info') {
        const gg = DB.giveaways[i.message.id];
        if (!gg) return i.reply({ embeds: [ERR('Veri yok.')], ephemeral: true });
        return i.reply({ embeds: [E().setTitle('Katilimcilar').setDescription(gg.parts.length ? gg.parts.map(p => `<@${p}>`).join('\n') : '> Henuz katilimci yok.')], ephemeral: true });
      }
      if (id === 'app:metin') {
        const st = STATE.get(sKey(i) + ':app');
        if (!st) return refresh(i, { embeds: [ERR('Oturum yok.')], components: [] });
        await i.deferUpdate().catch(() => {});
        const baslik = await collectChannel(i, '> **PANEL BASLIGI** — Basvuru paneli basligini yaz:');
        if (!baslik) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        const acik = await collectChannel(i, '> **PANEL ACIKLAMASI** — Panel aciklamasini yaz:');
        if (!acik) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.metin = { baslik, acik };
        STATE.set(sKey(i) + ':app', st);
        return appSetupUpdate(i);
      }
      if (id === 'app:addsoru') {
        const st = STATE.get(sKey(i) + ':app');
        if (!st) return refresh(i, { embeds: [ERR('Oturum yok.')], components: [] });
        if (st.sorular.length >= 15) return i.reply({ embeds: [ERR('Max 15 soru.')], ephemeral: true });
        await i.deferUpdate().catch(() => {});
        const soru = await collectChannel(i, `> **SORU ${st.sorular.length + 1}** — Soru metnini yaz:`);
        if (!soru) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.sorular.push(soru);
        STATE.set(sKey(i) + ':app', st);
        return appSetupUpdate(i);
      }
      if (id.startsWith('app:sorusil:')) {
        const st = STATE.get(sKey(i) + ':app');
        if (st) st.sorular.splice(parseInt(id.split(':')[2]), 1);
        return appSetupUpdate(i);
      }
      if (id === 'app:kur') {
        const st = STATE.get(sKey(i) + ':app');
        if (!st || !st.kanal || !st.log || !st.metin || !st.sorular.length) return refresh(i, { embeds: [ERR('Eksik: panel kanali, log kanali, metin ve en az 1 soru zorunlu.')], components: [] });
        const ch = i.guild.channels.cache.get(st.kanal);
        gconf(i.guild.id).app = { panel: st.kanal, log: st.log, rol: st.rol || null, metin: st.metin, sorular: st.sorular };
        await ch.send({ embeds: [E().setTitle(`${st.metin.baslik}`).setDescription(st.metin.acik)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('app:apply').setLabel('Basvuru Yap').setStyle(ButtonStyle.Primary))] });
        STATE.delete(sKey(i) + ':app');
        return refresh(i, { embeds: [OKC(`Basvuru sistemi kuruldu: ${ch}`)], components: [] });
      }
      if (id === 'app:apply') {
        const conf = gconf(i.guild.id).app;
        if (!conf) return i.reply({ embeds: [ERR('Sistem kurulu degil.')], ephemeral: true });
        await i.reply({ embeds: [E().setDescription('> **Basvuru formu DM\'ine gonderildi.**\nButonlarla onceki soruya donebilir, mesajin altina cevap yazabilirsin.')], ephemeral: true });
        const answers = await runAppFormDM(i.user, conf, i.guild);
        if (!answers) return i.editReply({ embeds: [ERR('Basvuru iptal edildi veya sure doldu.')], components: [] });
        const aid = rnd(1000, 9999);
        const qa = conf.sorular.map((q, x) => ({ q, a: answers[x] || '-' }));
        DB.apps[aid] = { id: aid, guild: i.guild.id, user: i.user.id, qa, status: 'YENI', time: now() };
        const logCh = i.guild.channels.cache.get(conf.log);
        if (logCh) await logCh.send({
          embeds: [appLogEmbed(DB.apps[aid])],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app:view:${aid}`).setLabel('Basvuruyu Gor').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`app:accept:${aid}`).setLabel('Kabul Et').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`app:reject:${aid}`).setLabel('Reddet').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`app:hold:${aid}`).setLabel('Beklemeye Al').setStyle(ButtonStyle.Secondary))]
        });
        saveDB();
        return i.editReply({ embeds: [OKC('Basvurun alindi! Sonuc DM ile bildirilecek.')], components: [] });
      }
      if (id.startsWith('app:view:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Sadece yonetici gorur.')], ephemeral: true });
        const a = DB.apps[id.split(':')[2]];
        if (!a) return i.reply({ embeds: [ERR('Bulunamadi.')], ephemeral: true });
        return i.reply({ embeds: [E().setTitle(`BASVURU #${a.id}`).setDescription(a.qa.map((q, x) => `**S${x + 1}:** ${q.q}\n> ${q.a}`).join('\n\n'))], ephemeral: true });
      }
      if (id.startsWith('app:accept:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
        const a = DB.apps[id.split(':')[2]];
        if (!a) return i.reply({ embeds: [ERR('Bulunamadi.')], ephemeral: true });
        a.status = 'KABUL';
        const conf = gconf(i.guild.id).app;
        const m = i.guild.members.cache.get(a.user);
        if (m && conf && conf.rol) await m.roles.add(conf.rol).catch(() => {});
        dmUser(await client.users.fetch(a.user), E(0x57F287).setDescription(`> **BASVURU SONUCU**\n**${i.guild.name}** adli sunucuda basvurunuz **kabul edildi**!\n> Yetkililer seninle iletisime gececek.`));
        await appLogUpdate(i, a);
        return i.reply({ embeds: [OKC('Basvuru kabul edildi, kullaniciya DM atildi.')], ephemeral: true });
      }
      if (id.startsWith('app:reject:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
        await i.deferUpdate().catch(() => {});
        const sebep = await collectChannel(i, '> **REDDETME ACIKLAMASI** — Kullaniciya DM gidecek sebebi yaz:');
        if (!sebep) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        const a = DB.apps[id.split(':')[2]];
        if (!a) return refresh(i, { embeds: [ERR('Bulunamadi.')], components: [] });
        a.status = 'RED';
        dmUser(await client.users.fetch(a.user), E(0xED4245).setDescription(`> **BASVURU SONUCU**\n**${i.guild.name}** adli sunucuda basvurunuz **reddedildi**.\n> Reddedilme sebebi: ${sebep}`));
        await appLogUpdate(i, a);
        return refresh(i, { embeds: [OKC('Basvuru reddedildi, kullaniciya sebepli DM atildi.')], components: [] });
      }
      if (id.startsWith('app:hold:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
        const a = DB.apps[id.split(':')[2]];
        if (!a) return i.reply({ embeds: [ERR('Bulunamadi.')], ephemeral: true });
        a.status = 'INCELEMEDE';
        dmUser(await client.users.fetch(a.user), E(0xFEE75C).setDescription(`> **BASVURU SONUCU**\n**${i.guild.name}** adli sunucuda basvurunuz **incelemeye/beklemeye alindi**.\n> Sonuc DM uzerinden bildirilecek.`));
        await appLogUpdate(i, a);
        return i.reply({ embeds: [OKC('Basvuru incelemeye alindi.')], ephemeral: true });
      }
      if (id.startsWith('dm:target:')) {
        const st = STATE.get(sKey(i) + ':dm') || { exp: now() + 600000 };
        st.target = id.split(':')[2];
        STATE.set(sKey(i) + ':dm', st);
        await i.deferUpdate().catch(() => {});
        if (st.target === 'uye') {
          const raw = await collectChannel(i, '> **UYE SEC** — Uye ID, mention veya **Discord kullanici adi** yaz:');
          if (!raw) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
          let member = null;
          const idm = (raw.match(/\d{17,20}/) || [null])[0];
          if (idm) member = await i.guild.members.fetch(idm).catch(() => null);
          if (!member) {
            const q = raw.replace(/^@/, '').trim().toLowerCase();
            member = i.guild.members.cache.find(m => m.user.username.toLowerCase() === q)
              || i.guild.members.cache.find(m => (m.displayName || '').toLowerCase() === q)
              || i.guild.members.cache.find(m => m.user.username.toLowerCase().includes(q));
          }
          if (!member) return refresh(i, { embeds: [ERR('Uye bulunamadi.')], components: [] });
          st.member = member.id;
          STATE.set(sKey(i) + ':dm', st);
        }
        const metin = await collectChannel(i, '> **DM METNI** — Gonderilecek mesaji yaz:');
        if (!metin) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.metin = metin;
        STATE.set(sKey(i) + ':dm', st);
        const hedef = st.target === 'everyone' ? 'Tum uyeler' : st.target === 'here' ? 'Cevrimici uyeler' : `<@${st.member}>`;
        return i.followUp({
          embeds: [E().setTitle('DM ONIZLEME').setDescription(`**Hedef:** ${hedef}\n\n> ${st.metin}`)],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dm:onay').setLabel('Gonder').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('dm:iptal').setLabel('Iptal').setStyle(ButtonStyle.Danger))],
          ephemeral: true
        });
      }
      if (id === 'dm:onay') {
        const st = STATE.get(sKey(i) + ':dm');
        if (!st || !st.metin) return i.update({ embeds: [ERR('Veri eksik.')], components: [] });
        await i.update({ embeds: [E().setDescription('> Gonderim basladi...')], components: [] });
        let targets = [];
        if (st.target === 'everyone') targets = (await i.guild.members.fetch()).filter(m => !m.user.bot).map(m => m.user);
        if (st.target === 'here') targets = i.guild.members.cache.filter(m => !m.user.bot && m.presence && m.presence.status !== 'offline').map(m => m.user);
        if (st.target === 'uye' && st.member) targets = [await client.users.fetch(st.member).catch(() => null)].filter(Boolean);
        let okc = 0, fail = 0;
        for (const u of targets) { const sent = await dmUser(u, { content: st.metin }); sent ? okc++ : fail++; await new Promise(r => setTimeout(r, 350)); }
        STATE.delete(sKey(i) + ':dm');
        return i.editReply({ embeds: [E(0x57F287).setTitle('DM RAPORU').setDescription(`**Basarili:** ${okc}\n**Basarisiz:** ${fail}\n> Gonderim tamamlandi.`)], components: [] });
      }
      if (id === 'dm:iptal') { STATE.delete(sKey(i) + ':dm'); return i.update({ embeds: [ERR('DM iptal.')], components: [] }); }
      if (id.startsWith('duel:accept:') || id.startsWith('duel:decline:')) {
        const d = STATE.get('duel:' + id.split(':')[2]);
        if (!d) return i.update({ embeds: [ERR('Duello zaman asimi.')], components: [] });
        if (i.user.id !== d.to) return i.reply({ embeds: [ERR('Bu duello sana ait degil.')], ephemeral: true });
        STATE.delete('duel:' + id.split(':')[2]);
        if (id.startsWith('duel:decline:')) return i.update({ embeds: [ERR('Duello reddedildi.')], components: [] });
        const a = uconf(d.from), b = uconf(d.to);
        if (a.balance < d.amt || b.balance < d.amt) return i.update({ embeds: [ERR('Bakiye yetersiz.')], components: [] });
        const r1 = rnd(1, 100), r2 = rnd(1, 100);
        const win = r1 === r2 ? null : (r1 > r2 ? d.from : d.to);
        if (win === d.from) { a.balance += d.amt; b.balance -= d.amt; }
        else if (win === d.to) { b.balance += d.amt; a.balance -= d.amt; }
        return i.update({ embeds: [E(0xFEE75C).setTitle('DUELLO SONUCU').setDescription(`**<@${d.from}>:** ${r1}\n**<@${i.user.id}>:** ${r2}\n> ${win ? `Kazanan: <@${win}> (${balF(d.amt)})` : 'Berabere, bahis iade.'}`)], components: [] });
      }
      if (id.startsWith('shop:buy:')) {
        const it = SHOP.find(s => s.id === id.split(':')[2]);
        const u = uconf(i.user.id);
        if (!it) return i.reply({ embeds: [ERR('Urun yok.')], ephemeral: true });
        if (u.balance < it.price) return i.reply({ embeds: [ERR(`Yetersiz bakiye: ${balF(u.balance)} / ${balF(it.price)}`)], ephemeral: true });
        u.balance -= it.price;
        if (it.id.startsWith('egg_')) {
          const pet = rollPet(it.id);
          u.pets.push(pet);
          addXP(i.user.id, 30);
          return i.reply({ embeds: [E(RARITIES[pet.rarity].color).setTitle('YUMURTA ACILDI!').setDescription(`**${pet.emoji} ${pet.name}**\n**Nadirlik:** ${RARITIES[pet.rarity].label}\n**Boost:** +${pet.boost} R$ / kazanc\n\n> \`/robux equip id:${pet.id}\` ile kusan.`)], ephemeral: true });
        }
        u.inv.push({ id: it.id, until: it.id === 'boost2x' ? now() + 3600000 : null });
        if (it.id === 'vip' && !u.badges.includes('vip')) u.badges.push('vip');
        return i.reply({ embeds: [OKC(`Satin alindi: **${it.name}**`)], ephemeral: true });
      }
    }
    if (i.isChannelSelectMenu()) {
      const id = i.customId; const ch = i.channels.first();
      if (id === 'tk:kanal') { const st = STATE.get(sKey(i) + ':tk') || {}; st.kanal = ch.id; STATE.set(sKey(i) + ':tk', st); return refresh(i, { embeds: [E().setDescription(`> Panel kanali: ${ch}\n> Rolleri sec ve **Devam**.`)] }); }
      if (id === 'mq:kanal') { const st = STATE.get(sKey(i) + ':mq') || {}; st.kanal = ch.id; STATE.set(sKey(i) + ':mq', st); return refresh(i, { embeds: [E().setDescription(`> Panel kanali: ${ch}`)] }); }
      if (id === 'app:kanal') { const st = STATE.get(sKey(i) + ':app'); if (st) st.kanal = ch.id; return refresh(i, { embeds: [E().setDescription(`> Panel kanali: ${ch}`)] }); }
      if (id === 'app:log') { const st = STATE.get(sKey(i) + ':app'); if (st) st.log = ch.id; return refresh(i, { embeds: [E().setDescription(`> Log kanali: ${ch}`)] }); }
      if (id === 'ann:kanal') { const st = STATE.get(sKey(i) + ':ann'); if (st) st.kanal = ch.id; return annPreview(i); }
    }
    if (i.isRoleSelectMenu()) {
      const id = i.customId;
      if (id === 'tk:rol') { const st = STATE.get(sKey(i) + ':tk') || {}; st.roller = i.roles.map(r => r.id); STATE.set(sKey(i) + ':tk', st); return refresh(i, { embeds: [E().setDescription(`> Etiket roller: ${i.roles.map(r => r.toString()).join(' ') || 'yok'}`)] }); }
      if (id === 'mq:rol') { const st = STATE.get(sKey(i) + ':mq') || {}; st.roller = i.roles.map(r => r.id); STATE.set(sKey(i) + ':mq', st); return refresh(i, { embeds: [E().setDescription(`> Etiket roller: ${i.roles.map(r => r.toString()).join(' ') || 'yok'}`)] }); }
      if (id === 'app:rol') { const st = STATE.get(sKey(i) + ':app'); if (st) st.rol = i.roles.first() ? i.roles.first().id : null; return refresh(i, { embeds: [E().setDescription(`> Kabul rolu: ${i.roles.first() || 'yok'}`)] }); }
      if (id === 'ann:rol') { const st = STATE.get(sKey(i) + ':ann'); if (st) st.rol = i.roles.first() ? i.roles.first().id : null; return annPreview(i); }
    }
    if (i.isStringSelectMenu()) {
      const id = i.customId;
      if (id === 'tk:secim') return createTicket(i, i.values[0]);
      if (id === 'help:cat') return i.update({ embeds: [helpEmbed(i.values[0])], components: [i.message.components[0]] });
      if (id === 'ann:mention') {
        const st = STATE.get(sKey(i) + ':ann');
        if (!st) return;
        st.mention = i.values[0];
        if (st.mention === 'rol') {
          const rows = i.message.components.slice();
          if (!rows.some(r => r.components.some(c => c.customId === 'ann:rol'))) rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('ann:rol').setPlaceholder('Ping rolu').setMinValues(1).setMaxValues(1)));
          return i.update({ components: rows });
        }
        return annPreview(i);
      }
    }
  } catch (e) {
    console.error(e);
    try {
      if (i.deferred || i.replied) await i.editReply({ embeds: [ERR('Hata:\n`' + String(e.message).slice(0, 150) + '`')] });
      else await i.reply({ embeds: [ERR('Hata:\n`' + String(e.message).slice(0, 150) + '`')], ephemeral: true });
    } catch (e2) {}
  }
});

/* ===================== OLAYLAR ===================== */
client.once('ready', async () => {
  console.log(`[STUDIOBLOX] Online: ${client.user.tag}`);
  for (const g of client.guilds.cache.values()) await g.commands.set(CMDS.map(c => c.data)).catch(e => console.error('cmd set', e.message));
  console.log(`[STUDIOBLOX] ${CMDS.length} komut kaydedildi.`);
});
client.on('guildCreate', async (g) => { await g.commands.set(CMDS.map(c => c.data)).catch(() => {}); });
client.on('guildMemberAdd', async (m) => {
  const g = gconf(m.guild.id);
  if (g.autorole) await m.roles.add(g.autorole).catch(() => {});
  updateUC(m.guild);
  /* XP: katilim bonusu */
  addXP(m.id, 10);
});
client.on('guildMemberRemove', (m) => updateUC(m.guild));
client.on('messageCreate', async (m) => {
  if (m.author.bot || !m.guild) return;
  const g = gconf(m.guild.id);
  if (!g.guard.kufur && !g.guard.reklam) return;
  if (m.member.permissions.has(PermissionFlagsBits.Administrator)) return;
  let sebep = null;
  if (g.guard.kufur && KUFUR_RX.test(m.content)) sebep = 'Kufur filtresi';
  if (!sebep && g.guard.reklam && REKLAM_RX.test(m.content)) sebep = 'Reklam/davet filtresi';
  if (!sebep) return;
  await m.delete().catch(() => {});
  const w = await m.channel.send({ embeds: [E(0xED4245).setDescription(`> **MESAJ SILINDI**\n${m.author}, ${sebep} ihlali tespit edildi.\n-# Tekrarinda otomatik ceza uygulanir.`)] });
  setTimeout(() => w.delete().catch(() => {}), 6000);
  g.strikes[m.author.id] = (g.strikes[m.author.id] || 0) + 1;
  await modlog(m.guild, E(0xED4245).setDescription(`> **GUARD**\n**Uye:** ${m.author.tag}\n**Sebep:** ${sebep}\n**Uyari sayisi:** ${g.strikes[m.author.id]}`));
  if (g.strikes[m.author.id] >= 3) {
    g.strikes[m.author.id] = 0;
    await m.member.timeout(600000, 'Guard: 3 ihlal').catch(() => {});
    await modlog(m.guild, E(0xED4245).setDescription(`> **GUARD CEZA**\n${m.author} 3 ihlal nedeniyle **10 dakika** susturuldu.`));
  }
});

/* ---------- ZAMANLAYICI ---------- */
setInterval(async () => {
  for (const [id, g] of Object.entries(DB.giveaways)) {
    if (g.ended) continue;
    const guild = client.guilds.cache.get(g.gid);
    if (!guild) continue;
    const ch = guild.channels.cache.get(g.cid);
    const left = g.end - now();
    const ping = g.ping === 'everyone' ? '@everyone' : g.ping === 'here' ? '@here' : g.ping === 'rol' && g.pingRole ? `<@&${g.pingRole}>` : '';
    if (!g.rem6 && left <= 21600000 && left > 0) {
      g.rem6 = true;
      if (ch) await ch.send({ content: `${ping} **Cekilis bitiyor acele edin!** Odul: **${g.prize}** — <t:${Math.floor(g.end / 1000)}:R> kaldi.` }).catch(() => {});
    }
    if (!g.rem1 && left <= 3600000 && left > 0) {
      g.rem1 = true;
      if (ch) await ch.send({ content: `${ping} **SON 1 SAAT! Cekilis bitiyor acele edin!** Odul: **${g.prize}**` }).catch(() => {});
    }
    if (left <= 0) { await endGiveaway(g, false); continue; }
    if (ch) { try { const msg = await ch.messages.fetch(g.mid); await msg.edit({ embeds: [gwEmbed(g)], components: [gwRow(g)] }); } catch (e) {} }
  }
  saveDB();
}, 30000);
setInterval(() => { client.guilds.cache.forEach(g => updateUC(g)); }, 600000);

/* ===================== BASLATMA ===================== */
process.on('unhandledRejection', (e) => console.error('UR:', e));
process.on('uncaughtException', (e) => console.error('UNCAUGHT:', e));
client.on('debug', (m) => console.log('[WS]', m));
client.on('error', (e) => console.error('[CLIENT ERROR]', e));

require('http').createServer((q, s) => { s.writeHead(200); s.end('Studioblox online'); }).listen(process.env.PORT || 8080);

setTimeout(() => {
  if (!client.isReady()) { console.error('[STUDIOBLOX] 60sn gecti, gateway READY olmadi -> restart'); process.exit(1); }
}, 60000);

initDB()
  .then(() => {
    console.log('[STUDIOBLOX] Token uzunlugu:', (CONFIG.token || '').trim().length);
    return client.login(CONFIG.token.trim());
  })
  .then(() => console.log('[STUDIOBLOX] login promise cozuldu'))
  .catch(e => { console.error('LOGIN/DB HATA:', e); process.exit(1); });
