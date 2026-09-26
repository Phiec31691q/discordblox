require('net').setDefaultAutoSelectFamily(false);
/* ============================================================
   STUDIOBLOX v3.0.1 - TURKIYE'NIN EN IYI EKONOMI BOTU
   v3.0.1: syntax hatasi duzeltildi (admin description).
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
  version: "3.0.1"
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
const emptyDB = () => ({ guilds: {}, users: {}, giveaways: {}, tickets: {}, apps: {}, admins: [] });
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
  if (!Array.isArray(DB.admins)) DB.admins = [];
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
    cd: { daily: 0, work: 0, ara: 0, mine: 0, fish: 0, heist: 0 }
  };
  const u = DB.users[uid];
  if (!u.pets) u.pets = [];
  if (u.xp === undefined) u.xp = 0;
  if (!u.level) u.level = 1;
  if (u.streak === undefined) u.streak = 0;
  if (!u.lastDaily) u.lastDaily = 0;
  u.cd = Object.assign({ daily: 0, work: 0, ara: 0, mine: 0, fish: 0, heist: 0 }, u.cd || {});
  return u;
}

/* ========================= YARDIMCILAR ========================= */
const E = (c = 0x5865F2) => new EmbedBuilder().setColor(c).setTimestamp().setFooter({ text: `Studioblox • v${CONFIG.version}` });
const ERR = (t) => E(0xED4245).setDescription(`> **Hata**\n${t}`);
const OKC = (t) => E(0x57F287).setDescription(`> **Basarili**\n${t}`);
const now = () => Date.now();
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (a) => a[rnd(0, a.length - 1)];
const isOwnerId = (id) => id === CONFIG.ownerId;
const isOwner = (u) => isOwnerId(u.id);
const isAdminBot = (id) => isOwnerId(id) || (Array.isArray(DB.admins) && DB.admins.includes(id));
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
async function collectUser(i, prompt) {
  const raw = await collectChannel(i, prompt);
  if (!raw) return null;
  const idm = (raw.match(/\d{17,20}/) || [null])[0];
  if (idm) return client.users.fetch(idm).catch(() => null);
  const q = raw.replace(/^@/, '').trim().toLowerCase();
  const g = i.guild;
  const m = g.members.cache.find(m => m.user.username.toLowerCase() === q)
    || g.members.cache.find(m => (m.displayName || '').toLowerCase() === q)
    || g.members.cache.find(m => m.user.username.toLowerCase().includes(q));
  return m ? m.user : null;
}

const STATE = new Map();
const sKey = (i, extra = '') => `${i.guild ? i.guild.id : 'dm'}:${i.user.id}${extra}`;
setInterval(() => {
  for (const [k, v] of STATE) {
    if (v.exp && v.exp < now()) {
      if (k.startsWith('trade:')) tradeDone(v, 'Sure doldu, trade iptal edildi.').catch(() => {});
      STATE.delete(k);
    }
  }
}, 30000);

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

/* ========================= EKONOMI / PET / TRADE ========================= */
const SHOP = [
  { id: 'boost2x', name: '2x Kazanc Boostu (1 saat)', price: 1000, desc: '1 saat boyunca kazanc x2.' },
  { id: 'sans', name: 'Sans Tilsimi', price: 750, desc: 'Sonraki /robux ara garantili 150-300 R$.' },
  { id: 'vip', name: 'VIP Rozet', price: 5000, desc: 'Kalici VIP rozeti.' },
  { id: 'egg_normal', name: 'Normal Yumurta', price: 500, desc: 'COMMON/UNCOMMON agirlikli.' },
  { id: 'egg_premium', name: 'Premium Yumurta', price: 2500, desc: 'RARE+ garanti, EPIC+ %40.' },
  { id: 'egg_mystic', name: 'Mystic Yumurta', price: 15000, desc: 'Garantili LEGENDARY veya MYSTIC.' }
];
const JOBS = ['Game Developer', 'Builder', 'Scripter', 'UI Tasarimci', 'Animator', 'Moderator', 'Youtuber', 'Pizza Kuryesi', 'Streamer', 'Tester'];

const RARITIES = {
  COMMON:    { label: 'COMMON',    color: 0x95A5A6, chance: 50,   boost: 50,   value: 300 },
  UNCOMMON:  { label: 'UNCOMMON',  color: 0x2ECC71, chance: 25,   boost: 100,  value: 800 },
  RARE:      { label: 'RARE',      color: 0x3498DB, chance: 15,   boost: 250,  value: 2000 },
  EPIC:      { label: 'EPIC',      color: 0x9B59B6, chance: 7,    boost: 500,  value: 5000 },
  LEGENDARY: { label: 'LEGENDARY', color: 0xF1C40F, chance: 2.5,  boost: 1500, value: 15000 },
  MYSTIC:    { label: 'MYSTIC',    color: 0xE91E63, chance: 0.5,  boost: 5000, value: 60000 }
};
const PETS_POOL = [
  { name: 'Kedi', emoji: '🐱' }, { name: 'Kopek', emoji: '🐶' }, { name: 'Tavsan', emoji: '🐰' },
  { name: 'Kurt', emoji: '🐺' }, { name: 'Tilki', emoji: '🦊' }, { name: 'Kaplan', emoji: '🐯' },
  { name: 'Aslan', emoji: '🦁' }, { name: 'Kartal', emoji: '🦅' }, { name: 'Yilan', emoji: '🐍' },
  { name: 'Ejderha', emoji: '🐉' }, { name: 'Anka', emoji: '🔥' }, { name: 'Unicorn', emoji: '🦄' },
  { name: 'Phoenix', emoji: '🕊️' }
];
function rollRarity(eggType) {
  if (eggType === 'egg_mystic') return Math.random() < 0.25 ? 'MYSTIC' : 'LEGENDARY';
  if (eggType === 'egg_premium') {
    const pool = ['RARE', 'EPIC', 'LEGENDARY', 'MYSTIC'];
    const weights = [15, 7, 2.5, 0.5];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let x = 0; x < pool.length; x++) { r -= weights[x]; if (r <= 0) return pool[x]; }
    return 'RARE';
  }
  let r = Math.random() * 100;
  for (const k of Object.keys(RARITIES)) { r -= RARITIES[k].chance; if (r <= 0) return k; }
  return 'COMMON';
}
function rollPet(eggType) {
  const rarity = rollRarity(eggType);
  const pet = pick(PETS_POOL);
  return {
    id: `${rarity.toLowerCase()}_${pet.name.toLowerCase().replace(/[^a-z]/g, '')}_${Date.now().toString(36)}${rnd(10, 99)}`,
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
  m += petBoostTotal(u.id) / 1000;
  return m;
}
function xpForLevel(lvl) { return Math.floor(100 * Math.pow(lvl, 1.5)); }
function addXP(uid, amount) {
  const u = uconf(uid);
  u.xp += amount;
  let ups = 0;
  while (u.xp >= xpForLevel(u.level)) { u.xp -= xpForLevel(u.level); u.level++; ups++; }
  return ups;
}

/* ---------- TRADE MOTORU ---------- */
function offerText(off) {
  return `**Nakit:** ${off.cash ? balF(off.cash) : '-'}\n**Petler:** ${off.pets.length ? off.pets.map(p => `${p.emoji} ${p.name}`).join(', ') : '-'}\n**Esyalar:** ${off.items.length ? off.items.map(s => s.id).join(', ') : '-'}`;
}
function tradeEmbed(t) {
  return E(0x5865F2).setTitle('TRADE OTURUMU').setDescription(
    `**<@${t.from}> teklifi:**\n${offerText(t.fromOffer)}\n\n**<@${t.to}> teklifi:**\n${offerText(t.toOffer)}\n\n**Onay:** <@${t.from}> ${t.conf.from ? '👌' : '—'} • <@${t.to}> ${t.conf.to ? '👌' : '—'}\n\n> Butonlar kendi teklifine ekler. Iki taraf da onaylayinca trade gerceklesir.`);
}
function tradeRows(id) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`trade:cash:${id}`).setLabel('Nakit Ekle').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`trade:pet:${id}`).setLabel('Pet Ekle').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`trade:item:${id}`).setLabel('Esya Ekle').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`trade:reset:${id}`).setLabel('Teklifimi Sifirla').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`trade:confirm:${id}`).setLabel('Onayla').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`trade:cancel:${id}`).setLabel('Iptal').setStyle(ButtonStyle.Danger))
  ];
}
async function tradeMsg(t) {
  const g = client.guilds.cache.get(t.gid);
  const ch = g && g.channels.cache.get(t.cid);
  if (!ch) return null;
  try { return await ch.messages.fetch(t.mid); } catch (e) { return null; }
}
async function tradeUpdate(t) {
  const m = await tradeMsg(t);
  if (m) await m.edit({ embeds: [tradeEmbed(t)], components: tradeRows(t.id) }).catch(() => {});
}
async function tradeDone(t, err) {
  const m = await tradeMsg(t);
  if (m) await m.edit({ embeds: [err ? ERR(err) : OKC('Trade tamamlandi! Teklifler degistirildi.')], components: [] }).catch(() => {});
}
function movePets(fromU, toU, list) {
  for (const p of list) {
    const idx = fromU.pets.findIndex(x => x.id === p.id);
    if (idx > -1) { const [pet] = fromU.pets.splice(idx, 1); pet.equipped = false; toU.pets.push(pet); }
  }
}
function moveItems(fromU, toU, list) {
  const sorted = [...list].sort((a, b) => b.idx - a.idx);
  const objs = [];
  for (const s of sorted) { const [it] = fromU.inv.splice(s.idx, 1); if (it) objs.push(it); }
  for (const it of objs.reverse()) toU.inv.push({ id: it.id, until: it.until || null });
}
async function executeTrade(t) {
  const A = uconf(t.from), B = uconf(t.to);
  if (A.balance < t.fromOffer.cash || B.balance < t.toOffer.cash) return tradeDone(t, 'Iptal: nakit yetersiz.');
  for (const [u, off] of [[A, t.fromOffer], [B, t.toOffer]])
    for (const p of off.pets) { const pet = u.pets.find(x => x.id === p.id); if (!pet || pet.equipped) return tradeDone(t, 'Iptal: pet kullanilamaz.'); }
  for (const [u, off] of [[A, t.fromOffer], [B, t.toOffer]])
    for (const s of off.items) { const it = u.inv[s.idx]; if (!it || it.id !== s.id) return tradeDone(t, 'Iptal: esya kullanilamaz.'); }
  A.balance -= t.fromOffer.cash; B.balance += t.fromOffer.cash;
  B.balance -= t.toOffer.cash; A.balance += t.toOffer.cash;
  movePets(A, B, t.fromOffer.pets); movePets(B, A, t.toOffer.pets);
  moveItems(A, B, t.fromOffer.items); moveItems(B, A, t.toOffer.items);
  saveDB();
  return tradeDone(t, null);
}

/* ========================= KOMUTLAR ========================= */
const CMDS = [];

/* ===================== OWNER PANEL ===================== */
function ownerRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ownp:adminadd').setLabel('Admin Ekle').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ownp:adminrem').setLabel('Admin Cikar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ownp:admins').setLabel('Admin Listesi').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ownp:pet').setLabel('Pet Ver').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ownp:bal').setLabel('Bakiye Ayarla').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ownp:item').setLabel('Esya Ver').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ownp:reset').setLabel('Uye Sifirla').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ownp:give').setLabel('Kendime Ekle').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ownp:global').setLabel('Global Mesaj').setStyle(ButtonStyle.Secondary))
  ];
}
function ownerPanelEmbed() {
  return E(0xF1C40F).setTitle('OWNER PANEL').setDescription(
    `> Bu panel ve tum islemler **sadece sana gorunur** (ephemeral).\n> Baskasi /owner yazsa bile erisemez.\n\n**Bot adminleri:** ${DB.admins.length ? DB.admins.map(a => `<@${a}>`).join(', ') : 'yok'}`);
}
CMDS.push({
  data: new SlashCommandBuilder().setName('owner').setDescription('Owner paneli (sadece bot sahibi, gizli)'),
  async execute(i) {
    if (!isOwner(i.user)) return i.reply({ embeds: [ERR('Bu komut **sadece bot sahibine** ozeldir.')], ephemeral: true });
    return i.reply({ embeds: [ownerPanelEmbed()], components: ownerRows(), ephemeral: true });
  }
});

/* ===================== ADMIN PANEL ===================== */
function adminRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adminp:pet').setLabel('Pet Ver').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adminp:bal').setLabel('Bakiye Ayarla').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adminp:item').setLabel('Esya Ver').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adminp:view').setLabel('Bakiye Gor').setStyle(ButtonStyle.Secondary))
  ];
}
CMDS.push({
  data: new SlashCommandBuilder().setName('admin').setDescription("Bot admin paneli (owner'in atadigi adminler)"),
  async execute(i) {
    if (!isAdminBot(i.user.id)) return i.reply({ embeds: [ERR('**Bot admini** degilsin. Owner seni owner panelinden ekleyebilir.')], ephemeral: true });
    return i.reply({ embeds: [E(0x3498DB).setTitle('ADMIN PANEL').setDescription('> Bot admin aracları. Sadece sana gorunur.')], components: adminRows(), ephemeral: true });
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
      embeds: [E().setTitle('Mequeen Studio Ticket Kurulumu').setDescription('> Hazir sablon: **Mequeen Studio Destek & Support**\n\n`1.` Panelin atilacagi kanali sec\n`2.` Etiket rolleri sec (istege bagli)\n`3.` **Paneli Kur** butonuna bas')],
      components: [
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('mq:kanal').setPlaceholder('Panel kanali sec...').setChannelTypes([ChannelType.GuildText])),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('mq:rol').setPlaceholder('Etiket roller (istege bagli)').setMinValues(0).setMaxValues(5)),
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
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep'))
    .addIntegerOption(o => o.setName('mesaj_sil').setDescription('Son X saniye mesajlarini sil')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    if (!m) return i.reply({ embeds: [ERR('Uye bulunamadi.')], ephemeral: true });
    if (m.id === i.user.id || (m.roles.highest.position >= i.member.roles.highest.position && !isOwner(i.user)))
      return i.reply({ embeds: [ERR('Bu uyeye islem uygulayamazsin.')], ephemeral: true });
    const sebep = i.options.getString('sebep') || 'Sebep belirtilmedi';
    const ds = i.options.getInteger('mesaj_sil') || 0;
    await dmUser(m.user, E(0xED4245).setDescription(`> **BAN**\n**Sunucu:** ${i.guild.name}\n**Sebep:** ${sebep}`));
    await m.ban({ deleteMessageSeconds: ds, reason: `${sebep} | ${i.user.tag}` });
    await modlog(i.guild, E(0xED4245).setDescription(`> **BAN**\n**Uye:** ${m.user.tag}\n**Yetkili:** ${i.user.tag}\n**Sebep:** ${sebep}`));
    i.reply({ embeds: [OKC(`${m.user.tag} yasaklandi.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('unban').setDescription('Ban kaldirir').setDMPermission(false)
    .addStringOption(o => o.setName('id').setDescription('Kullanici ID').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    try {
      const u = await i.guild.bans.fetch(i.options.getString('id'));
      await i.guild.bans.remove(u.user.id, i.user.tag);
      i.reply({ embeds: [OKC(`${u.user.tag} bani kaldirildi.`)] });
    } catch (e) { i.reply({ embeds: [ERR('Banli uye bulunamadi.')], ephemeral: true }); }
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
    await m.kick(`${sebep} | ${i.user.tag}`);
    await modlog(i.guild, E(0xED4245).setDescription(`> **KICK**\n**Uye:** ${m.user.tag}\n**Sebep:** ${sebep}`));
    i.reply({ embeds: [OKC(`${m.user.tag} atildi.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('mute').setDescription('Sureli susturur').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
    .addStringOption(o => o.setName('sure').setDescription('Orn: 10m, 1h, 1d').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const ms = parseDur(i.options.getString('sure'));
    if (!m || !m.moderatable) return i.reply({ embeds: [ERR('Timeout atilamaz.')], ephemeral: true });
    if (!ms || ms > 2419200000) return i.reply({ embeds: [ERR('Gecersiz sure.')], ephemeral: true });
    await m.timeout(ms, i.user.tag);
    i.reply({ embeds: [OKC(`${m.user.tag}, **${fmtDur(ms)}** susturuldu.`)] });
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
  data: new SlashCommandBuilder().setName('clear').setDescription('Mesaj siler').setDMPermission(false)
    .addIntegerOption(o => o.setName('miktar').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const msgs = await i.channel.messages.fetch({ limit: i.options.getInteger('miktar') });
    const sil = msgs.filter(m => (now() - m.createdTimestamp) < 1209600000);
    await i.channel.bulkDelete(sil, true);
    i.reply({ embeds: [OKC(`**${sil.size}** mesaj silindi.`)] }).then(r => setTimeout(() => r.delete().catch(() => {}), 5000));
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('warn').setDescription('Uyarir').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const g = gconf(i.guild.id);
    if (!g.warns[m.id]) g.warns[m.id] = [];
    g.warns[m.id].push({ by: i.user.id, reason: i.options.getString('sebep'), time: now() });
    await dmUser(m.user, E(0xFEE75C).setDescription(`> **UYARI**\n**Sunucu:** ${i.guild.name}\n**Sebep:** ${i.options.getString('sebep')}`));
    i.reply({ embeds: [OKC(`${m.user.tag} uyarildi. (Toplam: ${g.warns[m.id].length})`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('uyarilar').setDescription('Uyari listesi').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const list = gconf(i.guild.id).warns[i.options.getMember('uye').id] || [];
    i.reply({ embeds: [E().setTitle('Uyari Listesi').setDescription(list.length ? list.map((w, x) => `**${x + 1}.** ${w.reason}`).join('\n') : '> Uyari yok.')], ephemeral: true });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('uyari-sil').setDescription('Uyari siler').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Uye').setRequired(true))
    .addIntegerOption(o => o.setName('no').setDescription('No').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const list = gconf(i.guild.id).warns[i.options.getMember('uye').id] || [];
    const no = i.options.getInteger('no') - 1;
    if (!list[no]) return i.reply({ embeds: [ERR('Uyari yok.')], ephemeral: true });
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
    .addChannelOption(o => o.setName('kanal').setDescription('Kanal')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const ch = i.options.getChannel('kanal') || i.channel;
    await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false });
    i.reply({ embeds: [OKC(`${ch} kilitlendi.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('kilit-ac').setDescription('Kilit acar').setDMPermission(false)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanal')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const ch = i.options.getChannel('kanal') || i.channel;
    await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: true });
    i.reply({ embeds: [OKC(`${ch} acildi.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('otorol').setDescription('Oto rol').setDMPermission(false)
    .addSubcommand(s => s.setName('kur').setDescription('Kur').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)))
    .addSubcommand(s => s.setName('kapat').setDescription('Kapat')),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    const g = gconf(i.guild.id);
    if (i.options.getSubcommand() === 'kur') { g.autorole = i.options.getRole('rol').id; i.reply({ embeds: [OKC(`Otorol: <@&${g.autorole}>`)] }); }
    else { g.autorole = null; i.reply({ embeds: [OKC('Otorol kapatildi.')] }); }
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('guard').setDescription('Guard filtreleri').setDMPermission(false)
    .addSubcommand(s => s.setName('kufur').setDescription('Kufur filtresi')
      .addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({ name: 'Ac', value: 'ac' }, { name: 'Kapat', value: 'kapat' })))
    .addSubcommand(s => s.setName('reklam').setDescription('Reklam filtresi')
      .addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({ name: 'Ac', value: 'ac' }, { name: 'Kapat', value: 'kapat' }))),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    const g = gconf(i.guild.id);
    const ac = i.options.getString('durum') === 'ac';
    if (i.options.getSubcommand() === 'kufur') g.guard.kufur = ac; else g.guard.reklam = ac;
    i.reply({ embeds: [OKC(`Filtre: ${ac ? '**ACIK**' : '**KAPALI**'}`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('log-kur').setDescription('Modlog kanali').setDMPermission(false)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanal').setRequired(true).addChannelTypes(ChannelType.GuildText)),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    gconf(i.guild.id).modlog = i.options.getChannel('kanal').id;
    i.reply({ embeds: [OKC(`Modlog: ${i.options.getChannel('kanal')}`)] });
  }
});

/* ===================== DUYURU ===================== */
function duyuruCmd(name, desc, type) {
  CMDS.push({
    data: new SlashCommandBuilder().setName(name).setDescription(desc).setDMPermission(false),
    async execute(i) {
      if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
      await i.deferReply({ ephemeral: true });
      const baslik = await collectChannel(i, '> **1/5 BASLIK** — Duyuru basligini yaz:');
      if (!baslik) return i.editReply({ embeds: [ERR('Sure doldu.')], components: [] });
      const icerik = await collectChannel(i, '> **2/5 ICERIK** — Duyuru metni (markdown serbest):');
      if (!icerik) return i.editReply({ embeds: [ERR('Sure doldu.')], components: [] });
      const thumb = await collectChannel(i, '> **3/5 THUMBNAIL** — URL veya `-`:');
      if (thumb === null) return i.editReply({ embeds: [ERR('Sure doldu.')], components: [] });
      const image = await collectChannel(i, '> **4/5 BUYUK GORSEL** — URL veya `-`:');
      if (image === null) return i.editReply({ embeds: [ERR('Sure doldu.')], components: [] });
      const renk = await collectChannel(i, '> **5/5 RENK** — Hex veya `-`:');
      if (renk === null) return i.editReply({ embeds: [ERR('Sure doldu.')], components: [] });
      STATE.set(sKey(i) + ':ann', {
        exp: now() + 600000, type, baslik, icerik,
        thumb: thumb === '-' ? null : thumb, image: image === '-' ? null : image,
        renk: renk === '-' ? null : renk, kanal: i.channel.id, mention: 'yok', rol: null
      });
      return annPreview(i);
    }
  });
}
duyuruCmd('güncelleme-duyuru', 'Profesyonel guncelleme duyurusu', 'guncelleme');
duyuruCmd('leak-duyuru', 'Profesyonel leak duyurusu', 'leak');
function annEmbed(a, user) {
  const color = a.renk ? parseInt(String(a.renk).replace('#', ''), 16) || (a.type === 'leak' ? 0xED4245 : 0x57F287) : (a.type === 'leak' ? 0xED4245 : 0x57F287);
  const eb = E(color);
  if (a.type === 'leak') eb.setDescription(`**LEAK / SIZINTI BULTENI**\n> **${a.baslik}**\n> *Kaynak dogrulanmamistir.*\n\n${a.icerik}`);
  else eb.setDescription(`**GUNCELLEME DUYURUSU**\n> **${a.baslik}**\n\n${a.icerik}`);
  if (a.thumb) eb.setThumbnail(a.thumb);
  if (a.image) eb.setImage(a.image);
  eb.setFooter({ text: `Hazirlayan: ${user.tag} • Studioblox` });
  return eb;
}
async function annPreview(i) {
  const st = STATE.get(sKey(i) + ':ann');
  if (!st) return;
  const rows = [
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('ann:kanal').setPlaceholder('Hedef kanal').setChannelTypes([ChannelType.GuildText])),
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
    .addSubcommand(s => s.setName('başlat').setDescription('Baslat')
      .addStringOption(o => o.setName('sure').setDescription('Orn: 3d, 6h, 30m').setRequired(true))
      .addStringOption(o => o.setName('odul').setDescription('Odul').setRequired(true))
      .addIntegerOption(o => o.setName('kazanan').setDescription('Kazanan').setRequired(true).setMinValue(1).setMaxValue(20))
      .addStringOption(o => o.setName('tur').setDescription('Tur').setRequired(true).addChoices({ name: 'Normal', value: 'normal' }, { name: 'Rol Şartlı', value: 'rol' }, { name: 'Emek Şartlı', value: 'emek' }))
      .addRoleOption(o => o.setName('rol').setDescription('Rol sarti'))
      .addChannelOption(o => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('ping').setDescription('Ping').addChoices({ name: 'Yok', value: 'yok' }, { name: 'Everyone', value: 'everyone' }, { name: 'Here', value: 'here' }, { name: 'Rol', value: 'rol' }))
      .addRoleOption(o => o.setName('ping_rol').setDescription('Ping rolu'))
      .addStringOption(o => o.setName('aciklama').setDescription('Aciklama')))
    .addSubcommand(s => s.setName('bitir').setDescription('Bitir').addStringOption(o => o.setName('mesaj_id').setDescription('ID').setRequired(true)))
    .addSubcommand(s => s.setName('yeniden').setDescription('Reroll').addStringOption(o => o.setName('mesaj_id').setDescription('ID').setRequired(true))),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const sub = i.options.getSubcommand();
    if (sub === 'başlat') {
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
      g.mid = msg.id; DB.giveaways[msg.id] = g;
      i.reply({ embeds: [OKC(`Cekilis baslatildi: ${msg.url}`)], ephemeral: true });
    } else {
      const g = DB.giveaways[i.options.getString('mesaj_id')];
      if (!g || g.gid !== i.guild.id) return i.reply({ embeds: [ERR('Bulunamadi.')], ephemeral: true });
      if (sub === 'bitir') { if (g.ended) return i.reply({ embeds: [ERR('Zaten bitmis.')], ephemeral: true }); await endGiveaway(g, false); }
      else await endGiveaway(g, true);
      i.reply({ embeds: [OKC('Islem tamam.')], ephemeral: true });
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
  let d = `**Odul:** ${g.prize}\n**Kazanan:** ${g.winners} kisi\n**Bitis:** <t:${Math.floor(g.end / 1000)}:R>\n**Katilimci:** ${g.parts.length} uye`;
  if (g.roleReq) d += `\n**Sart:** <@&${g.roleReq}>`;
  if (g.desc) d += `\n\n> ${g.desc}`;
  d += `\n\n> Katil butonuna bas!`;
  eb.setDescription(d);
  if (g.ended) { eb.setColor(0x57F287); eb.setTitle(`CEKILIS BITTI: ${g.prize}`); }
  return eb;
}
async function endGiveaway(g, reroll) {
  const guild = client.guilds.cache.get(g.gid); if (!guild) return;
  const ch = guild.channels.cache.get(g.cid);
  let pool = g.parts.slice();
  if (g.roleReq) pool = pool.filter(id => { const m = guild.members.cache.get(id); return m && m.roles.cache.has(g.roleReq); });
  const wins = [];
  while (wins.length < g.winners && pool.length) wins.push(pool.splice(rnd(0, pool.length - 1), 1)[0]);
  g.ended = true;
  const eb = gwEmbed(g);
  eb.setDescription(`**Kazananlar:** ${wins.length ? wins.map(w => `<@${w}>`).join(', ') : 'Yok'}\n**Katilimci:** ${g.parts.length}`);
  try { const msg = await ch.messages.fetch(g.mid); await msg.edit({ embeds: [eb], components: [] }); } catch (e) {}
  if (wins.length) {
    await ch.send({ content: `${wins.map(w => `<@${w}>`).join(', ')} **Tebrikler! \`${g.prize}\` kazandiniz!**` });
    for (const w of wins) { const u = await client.users.fetch(w).catch(() => null); if (u) dmUser(u, E(0x57F287).setDescription(`> **CEKILIS KAZANDIN**\n**Odul:** ${g.prize}`)); }
  } else await ch.send({ content: '**Cekilis bitti:** katilimci yok.' });
  saveDB();
}

/* ===================== BASVURU ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('başvuru-sistemi').setDescription('Gelismis basvuru sistemi').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    STATE.set(sKey(i) + ':app', { exp: now() + 900000, kanal: null, log: null, rol: null, metin: null, sorular: [] });
    await i.reply({
      embeds: [E().setTitle('Basvuru Sistemi Kurulumu').setDescription('`1.` Panel & log kanali, kabul rolu sec\n`2.` **Panel Metni**\n`3.` **Soru Ekle** (max 15)\n`4.` **Sistemi Kur**')],
      components: [
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:kanal').setPlaceholder('Panel kanali').setChannelTypes([ChannelType.GuildText])),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:log').setPlaceholder('LOG kanali').setChannelTypes([ChannelType.GuildText])),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('app:rol').setPlaceholder('Kabul rolu').setMinValues(0).setMaxValues(1)),
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
  data: new SlashCommandBuilder().setName('dm-at').setDescription('DM gonderir').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    STATE.set(sKey(i) + ':dm', { exp: now() + 600000, target: null, member: null });
    await i.reply({
      embeds: [E().setTitle('DM Gonderim').setDescription('`everyone` → tum uyeler\n`here` → aktif uyeler\n`uye` → ID / mention / **kullanici adi**')],
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
  moderasyon: [['/ban', 'Yasaklar'], ['/unban', 'Ban kaldirir'], ['/kick', 'Atar'], ['/mute', 'Susturur'], ['/unmute', 'Acma'], ['/clear', 'Mesaj siler'], ['/warn', 'Uyarir'], ['/uyarilar', 'Liste'], ['/uyari-sil', 'Siler'], ['/slowmode', 'Yavas mod'], ['/kilitle', 'Kilit'], ['/kilit-ac', 'Kilit ac'], ['/otorol', 'Oto rol'], ['/guard', 'Filtreler'], ['/log-kur', 'Modlog']],
  ticket: [['/ticket-kur', 'Ticket paneli'], ['/ticket-kur-mequeen', 'Mequeen panel'], ['Panel menusu', 'Kategori secimi'], ['Ticket butonlari', 'Kapat + transcript']],
  duyuru: [['/guncelleme-duyuru', 'Duyuru'], ['/leak-duyuru', 'Leak bulteni'], ['Onizleme', 'Kanal/mention secimi']],
  cekilis: [['/cekilis baslat', 'Baslat'], ['/cekilis bitir', 'Bitir'], ['/cekilis yeniden', 'Reroll']],
  basvuru: [['/basvuru-sistemi', 'Kurulum'], ['Log butonlari', 'Gor/Kabul/Reddet/Bekle'], ['DM form', 'Butonlu geri donme']],
  dm: [['/dm-at', 'Everyone/Here/Uye (ad ile)']],
  ekonomi: [['/robux bakiye', 'Detayli profil'], ['/robux cash', 'Transfer'], ['/robux gunluk', 'Gunluk + streak + faiz'], ['/robux calis', 'Is'], ['/robux ara', 'Arama'], ['/robux maden', 'Maden kazisi'], ['/robux balik', 'Balik avi'], ['/robux soygun', 'Uye soygun (riskli)'], ['/robux yazitura', 'Coinflip'], ['/robux bahis', 'Zar'], ['/robux duel', 'Duello'], ['/robux trade', 'PET/ESYA/NAKIT trade'], ['/robux yatir / cek', 'Banka'], ['/robux market', 'Magaza'], ['/robux egg', 'Yumurta'], ['/robux pets', 'Koleksiyon'], ['/robux petbilgi', 'Tek pet detayi'], ['/robux petindex', 'Tum pet katalog'], ['/robux equip', 'Pet kusan'], ['/robux envanter', 'Esyalar'], ['/robux liderler', 'Top 10'], ['/robux bilgi', 'Rehber']],
  genel: [['/yardim', 'Menu (DM)'], ['/ping', 'Gecikme'], ['/avatar', 'Avatar'], ['/sunucu-bilgi', 'Sunucu'], ['/uye-bilgi', 'Uye'], ['/user-count', 'Sayac']],
  owner: [['/owner', 'OWNER PANEL (sadece owner, gizli): admin ekle/cikar, pet ver, bakiye ayarla, esya ver, sifirla, global mesaj'], ['/admin', 'BOT ADMIN PANEL: pet ver, bakiye ayarla, esya ver, bakiye gor']]
};
function helpEmbed(cat) {
  if (!cat) return E().setTitle('Studioblox Yardim Merkezi').setDescription(`> Kategoriler:\n\`moderasyon\` \`ticket\` \`duyuru\` \`cekilis\` \`basvuru\` \`dm\` \`ekonomi\` \`genel\` \`owner\`\n\n-# DM uzerinden gonderildi.`);
  return E().setTitle(`Yardim: ${cat.toUpperCase()}`).setDescription(CATS[cat].map(l => `**${l[0]}**\n> ${l[1]}`).join('\n\n'));
}
CMDS.push({
  data: new SlashCommandBuilder().setName('yardım').setDescription('Yardim menusu (DM)'),
  async execute(i) {
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help:cat').setPlaceholder('Kategori sec...')
      .addOptions(Object.keys(CATS).map(k => ({ label: k.toUpperCase(), value: k, description: `${CATS[k].length} komut` }))));
    const ok = await dmUser(i.user, { embeds: [helpEmbed(null)], components: [row] });
    if (ok) i.reply({ embeds: [E().setDescription('> **Yardim menusu DM\'ine gonderildi.**')], ephemeral: true });
    else i.reply({ embeds: [ERR('DM kapali.')], ephemeral: true });
  }
});

/* ===================== USER COUNT ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('user-count').setDescription('Kilitli sayac kanallari').setDMPermission(false)
    .addSubcommand(s => s.setName('kur').setDescription('Kur').addStringOption(o => o.setName('dil').setDescription('Dil').setRequired(true).addChoices({ name: 'English', value: 'en' }, { name: 'Turkce', value: 'tr' })))
    .addSubcommand(s => s.setName('kapat').setDescription('Kapat')),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici olmalisin.')], ephemeral: true });
    const g = gconf(i.guild.id);
    if (i.options.getSubcommand() === 'kapat') {
      if (g.usercount.categoryId) { const c = i.guild.channels.cache.get(g.usercount.categoryId); if (c) await c.delete().catch(() => {}); }
      g.usercount = { enabled: false, lang: 'en', categoryId: null, ch1: null, ch2: null };
      return i.reply({ embeds: [OKC('Silindi.')], ephemeral: true });
    }
    const lang = i.options.getString('dil');
    const cat = await i.guild.channels.create({ name: lang === 'tr' ? 'ISTATISTIK' : 'STATISTICS', type: ChannelType.GuildCategory, permissionOverwrites: [{ id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }] });
    await cat.setPosition(0).catch(() => {});
    const mk = async (name) => i.guild.channels.create({ name, type: ChannelType.GuildVoice, parent: cat.id, userLimit: 0, permissionOverwrites: [{ id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }] });
    const c1 = await mk(lang === 'tr' ? 'Uye Sayisi: 0' : 'Member Count: 0');
    const c2 = await mk(lang === 'tr' ? 'Bot Sayisi: 0' : 'Bot Count: 0');
    g.usercount = { enabled: true, lang, categoryId: cat.id, ch1: c1.id, ch2: c2.id };
    await updateUC(i.guild);
    i.reply({ embeds: [OKC('Sayac kanallari kuruldu (kilitli).')], ephemeral: true });
  }
});
async function updateUC(guild) {
  const g = gconf(guild.id);
  if (!g.usercount.enabled) return;
  const all = guild.members.cache;
  const bots = all.filter(m => m.user.bot).size;
  const humans = all.size - bots;
  const c1 = guild.channels.cache.get(g.usercount.ch1), c2 = guild.channels.cache.get(g.usercount.ch2);
  if (!c1 || !c2) { g.usercount.enabled = false; return; }
  const n1 = g.usercount.lang === 'tr' ? `Uye Sayisi: ${humans}` : `Member Count: ${humans}`;
  const n2 = g.usercount.lang === 'tr' ? `Bot Sayisi: ${bots}` : `Bot Count: ${bots}`;
  if (c1.name !== n1) await c1.setName(n1).catch(() => {});
  if (c2.name !== n2) await c2.setName(n2).catch(() => {});
}

/* ===================== ROBUX ===================== */
CMDS.push({
  data: new SlashCommandBuilder().setName('robux').setDescription('Robux ekonomi sistemi')
    .addSubcommand(s => s.setName('bakiye').setDescription('Detayli profil').addUserOption(o => o.setName('uye').setDescription('Uye')))
    .addSubcommand(s => s.setName('cash').setDescription('Transfer').addUserOption(o => o.setName('uye').setDescription('Alici').setRequired(true)).addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('gunluk').setDescription('Gunluk + streak + banka faizi'))
    .addSubcommand(s => s.setName('calis').setDescription('Is'))
    .addSubcommand(s => s.setName('ara').setDescription('Arama'))
    .addSubcommand(s => s.setName('maden').setDescription('Maden kazisi (30dk)'))
    .addSubcommand(s => s.setName('balik').setDescription('Balik avi (20dk)'))
    .addSubcommand(s => s.setName('soygun').setDescription('Uye soygun (2sa, riskli)').addUserOption(o => o.setName('uye').setDescription('Hedef').setRequired(true)))
    .addSubcommand(s => s.setName('yazitura').setDescription('Coinflip').addStringOption(o => o.setName('tahmin').setDescription('Tahmin').setRequired(true).addChoices({ name: 'Yazi', value: 'yazi' }, { name: 'Tura', value: 'tura' })).addIntegerOption(o => o.setName('miktar').setDescription('Bahis').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('bahis').setDescription('Zar').addIntegerOption(o => o.setName('miktar').setDescription('Bahis').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('duel').setDescription('Duello').addUserOption(o => o.setName('uye').setDescription('Rakip').setRequired(true)).addIntegerOption(o => o.setName('miktar').setDescription('Bahis').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('trade').setDescription('Trade baslat').addUserOption(o => o.setName('uye').setDescription('Trade ortagi').setRequired(true)))
    .addSubcommand(s => s.setName('yatir').setDescription('Yatir').addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('cek').setDescription('Cek').addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('market').setDescription('Magaza'))
    .addSubcommand(s => s.setName('envanter').setDescription('Esyalar'))
    .addSubcommand(s => s.setName('egg').setDescription('Yumurta ac').addStringOption(o => o.setName('tur').setDescription('Tur').setRequired(true).addChoices({ name: 'Normal (500)', value: 'egg_normal' }, { name: 'Premium (2500)', value: 'egg_premium' }, { name: 'Mystic (15000)', value: 'egg_mystic' })))
    .addSubcommand(s => s.setName('pets').setDescription('Koleksiyon').addUserOption(o => o.setName('uye').setDescription('Uye')))
    .addSubcommand(s => s.setName('petbilgi').setDescription('Tek pet detayi').addStringOption(o => o.setName('id').setDescription('Pet ID').setRequired(true)))
    .addSubcommand(s => s.setName('petindex').setDescription('Tum pet katalog + oranlar'))
    .addSubcommand(s => s.setName('equip').setDescription('Pet kusan/ac').addStringOption(o => o.setName('id').setDescription('Pet ID').setRequired(true)))
    .addSubcommand(s => s.setName('liderler').setDescription('Top 10'))
    .addSubcommand(s => s.setName('bilgi').setDescription('Rehber')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const u = uconf(i.user.id);
    const ownerBadge = isOwner(i.user) ? '• **OWNER**' : '';
    if (sub === 'bakiye') {
      const t = i.options.getUser('uye') || i.user;
      const tu = uconf(t.id);
      const eq = tu.pets.filter(p => p.equipped);
      return i.reply({ embeds: [E(isOwner(t) ? 0xF1C40F : 0x57F287).setTitle('BAKIYE KARTI').setThumbnail(t.displayAvatarURL())
        .setDescription(`**Uye:** ${t.tag} ${ownerBadge}\n**Cuzdan:** ${balF(tu.balance)}\n**Banka:** ${balF(tu.bank)}\n**Toplam:** ${balF(tu.balance + tu.bank)}\n**Seviye:** ${tu.level} (XP ${tu.xp}/${xpForLevel(tu.level)})\n**Streak:** ${tu.streak} gun\n**Kusanilan:** ${eq.length ? eq.map(p => `${p.emoji} ${p.name}`).join(', ') : 'yok'}\n**Pet Boost:** +${petBoostTotal(t.id)}\n**Pet sayisi:** ${tu.pets.length}`)] });
    }
    if (sub === 'cash') {
      const t = i.options.getUser('uye'); const m = i.options.getInteger('miktar');
      if (t.bot) return i.reply({ embeds: [ERR('Botlara transfer yok.')], ephemeral: true });
      if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true });
      u.balance -= m; uconf(t.id).balance += m; addXP(i.user.id, 5);
      dmUser(t, E(0x57F287).setDescription(`> **TRANSFER**\n**Gonderen:** ${i.user.tag}\n**Miktar:** ${balF(m)}`));
      return i.reply({ embeds: [OKC(`${t.tag} uyesine ${balF(m)} gonderildi.`)] });
    }
    if (sub === 'gunluk') {
      if (u.cd.daily > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.daily - now())}**`)], ephemeral: true });
      const yesterday = now() - 86400000;
      if (u.lastDaily > yesterday && u.lastDaily < now() - 3600000) u.streak++;
      else if (u.lastDaily < yesterday || u.lastDaily === 0) u.streak = 1;
      const streakBonus = Math.min(u.streak * 10, 200);
      const interest = Math.min(Math.floor(u.bank * 0.02), 2000);
      const kaz = Math.floor((250 + streakBonus) * boostMul(i.user)) + interest;
      u.balance += kaz; u.cd.daily = now() + 86400000; u.lastDaily = now();
      addXP(i.user.id, 20);
      return i.reply({ embeds: [OKC(`Gunluk odul: ${balF(kaz)}\n> Streak: **${u.streak} gun** (+${streakBonus})\n> Banka faizi: +${balF(interest)} (%2)`)] });
    }
    if (sub === 'calis') {
      if (u.cd.work > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.work - now())}**`)], ephemeral: true });
      const kaz = Math.floor(rnd(100, 400) * boostMul(i.user));
      u.balance += kaz; u.cd.work = now() + 3600000; addXP(i.user.id, 15);
      return i.reply({ embeds: [OKC(`**${pick(JOBS)}** olarak calistin: ${balF(kaz)}`)] });
    }
    if (sub === 'ara') {
      if (u.cd.ara > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.ara - now())}**`)], ephemeral: true });
      let kaz; const si = u.inv.findIndex(x => x.id === 'sans');
      if (si > -1) { kaz = rnd(150, 300); u.inv.splice(si, 1); } else kaz = Math.floor(rnd(15, 120) * boostMul(i.user));
      u.balance += kaz; u.cd.ara = now() + 1800000; addXP(i.user.id, 10);
      return i.reply({ embeds: [OKC(`Aramada ${balF(kaz)} buldun.`)] });
    }
    if (sub === 'maden') {
      if (u.cd.mine > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.mine - now())}**`)], ephemeral: true });
      u.cd.mine = now() + 1800000;
      const r = Math.random(); let kaz = 0, tier = 'Maden goktu, bir sey bulunamadi.';
      if (r >= 0.15 && r < 0.65) { kaz = rnd(50, 150); tier = 'Common cevher'; }
      else if (r < 0.90) { kaz = rnd(200, 500); tier = 'Rare cevher'; }
      else if (r < 0.98) { kaz = rnd(600, 1200); tier = 'Epic cevher'; }
      else if (r >= 0.98) { kaz = rnd(2000, 5000); tier = '**LEGENDARY** cevher'; }
      kaz = Math.floor(kaz * boostMul(i.user)); u.balance += kaz; addXP(i.user.id, 12);
      return i.reply({ embeds: [kaz ? OKC(`${tier} bulundu: ${balF(kaz)}`) : ERR(tier)] });
    }
    if (sub === 'balik') {
      if (u.cd.fish > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.fish - now())}**`)], ephemeral: true });
      u.cd.fish = now() + 1200000;
      const fishes = [['Hamsi', 20, 60], ['Levrek', 60, 150], ['Somon', 150, 350], ['Kilic Baligi', 350, 800], ['Altin Balik', 800, 2000]];
      const r = Math.random(); let f;
      if (r < 0.05) f = null; else f = fishes[Math.min(fishes.length - 1, Math.floor(Math.pow(r, 1.6) * fishes.length))];
      if (!f) return i.reply({ embeds: [ERR('Cizme takildi, balik kacti.')] });
      const kaz = Math.floor(rnd(f[1], f[2]) * boostMul(i.user));
      u.balance += kaz; addXP(i.user.id, 10);
      return i.reply({ embeds: [OKC(`**${f[0]}** yakaladin: ${balF(kaz)}`)] });
    }
    if (sub === 'soygun') {
      const t = i.options.getMember('uye');
      if (!t || t.user.bot || t.id === i.user.id) return i.reply({ embeds: [ERR('Gecersiz hedef.')], ephemeral: true });
      if (isOwner(t.user)) return i.reply({ embeds: [ERR('Owner soyulamaz.')], ephemeral: true });
      if (u.cd.heist > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.heist - now())}**`)], ephemeral: true });
      u.cd.heist = now() + 7200000;
      const tu = uconf(t.id);
      const chance = 0.45 + Math.min(u.level * 0.005, 0.15);
      if (Math.random() < chance) {
        const steal = Math.min(Math.floor(tu.balance * rnd(10, 30) / 100), 10000);
        if (steal < 1) return i.reply({ embeds: [ERR('Hedefin cuzdani bos.')] });
        tu.balance -= steal; u.balance += steal; addXP(i.user.id, 25);
        return i.reply({ embeds: [OKC(`Soygun BASARILI! ${t.user.tag} uyesinden ${balF(steal)} calindi.`)] });
      } else {
        const fine = Math.min(Math.floor(u.balance * 0.1), 1000);
        u.balance -= fine; tu.balance += fine;
        return i.reply({ embeds: [ERR(`Soygun BASARISIZ! Yakalandin, ${balF(fine)} tazminat odendi.`)] });
      }
    }
    if (sub === 'yazitura') {
      const m = i.options.getInteger('miktar'); const t = i.options.getString('tahmin');
      if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true });
      const sonuc = Math.random() < 0.5 ? 'yazi' : 'tura';
      if (sonuc === t) { u.balance += m; addXP(i.user.id, 8); return i.reply({ embeds: [OKC(`**${sonuc}** → Kazandin ${balF(m)}!`)] }); }
      u.balance -= m;
      return i.reply({ embeds: [ERR(`**${sonuc}** → Kaybettin ${balF(m)}.`)] });
    }
    if (sub === 'bahis') {
      const m = i.options.getInteger('miktar');
      if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true });
      const r = rnd(1, 100);
      if (r === 100) { u.balance += m * 9; addXP(i.user.id, 50); return i.reply({ embeds: [OKC(`JACKPOT! x10 (${balF(m * 10)})`)] }); }
      if (r >= 50) { u.balance += m; addXP(i.user.id, 15); return i.reply({ embeds: [OKC(`Zar **${r}** → x2 (${balF(m * 2)})`)] }); }
      u.balance -= m;
      return i.reply({ embeds: [ERR(`Zar **${r}** → Kaybettin.`)] });
    }
    if (sub === 'duel') {
      const t = i.options.getMember('uye'); const m = i.options.getInteger('miktar');
      if (!t || t.user.bot || t.id === i.user.id) return i.reply({ embeds: [ERR('Gecersiz rakip.')], ephemeral: true });
      if (u.balance < m || uconf(t.id).balance < m) return i.reply({ embeds: [ERR('Bakiye yetersiz.')], ephemeral: true });
      const id = rnd(100000, 999999);
      STATE.set('duel:' + id, { exp: now() + 60000, from: i.user.id, to: t.id, amt: m });
      return i.reply({
        embeds: [E(0xFEE75C).setTitle('DUELLO').setDescription(`**${i.user.tag}** vs **${t.user.tag}**\n**Bahis:** ${balF(m)}\n> 60 sn icinde kabul.`)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`duel:accept:${id}`).setLabel('Kabul Et').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`duel:decline:${id}`).setLabel('Reddet').setStyle(ButtonStyle.Danger))]
      });
    }
    if (sub === 'trade') {
      const t2 = i.options.getMember('uye');
      if (!t2 || t2.user.bot || t2.id === i.user.id) return i.reply({ embeds: [ERR('Gecersiz trade ortagi.')], ephemeral: true });
      const id = rnd(100000, 999999);
      const t = { id, gid: i.guild.id, cid: i.channel.id, from: i.user.id, to: t2.id, fromOffer: { cash: 0, pets: [], items: [] }, toOffer: { cash: 0, pets: [], items: [] }, conf: { from: false, to: false }, exp: now() + 300000 };
      STATE.set('trade:' + id, t);
      const msg = await i.reply({ fetchReply: true, embeds: [tradeEmbed(t)], components: tradeRows(id) });
      t.mid = msg.id;
      return;
    }
    if (sub === 'yatir') { const m = i.options.getInteger('miktar'); if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz.')], ephemeral: true }); u.balance -= m; u.bank += m; return i.reply({ embeds: [OKC(`Bankaya ${balF(m)} (gunluk %2 faiz).`)] }); }
    if (sub === 'cek') { const m = i.options.getInteger('miktar'); if (u.bank < m) return i.reply({ embeds: [ERR('Bankada yeterli yok.')], ephemeral: true }); u.bank -= m; u.balance += m; return i.reply({ embeds: [OKC(`${balF(m)} cekildi.`)] }); }
    if (sub === 'market') {
      const rows = [];
      for (let x = 0; x < SHOP.length; x += 5) rows.push(new ActionRowBuilder().addComponents(SHOP.slice(x, x + 5).map(it =>
        new ButtonBuilder().setCustomId(`shop:buy:${it.id}`).setLabel(`${it.name.split(' (')[0]} — R$ ${it.price}`).setStyle(ButtonStyle.Secondary))));
      return i.reply({ embeds: [E(0x5865F2).setTitle('ROBUX MARKET').setDescription(SHOP.map(it => `**${it.name}** — ${balF(it.price)}\n> ${it.desc}`).join('\n\n'))], components: rows, ephemeral: true });
    }
    if (sub === 'envanter') return i.reply({ embeds: [E().setTitle('ENVANTER').setDescription(u.inv.length ? u.inv.map((x, idx) => `[${idx}] **${x.id}**${x.until ? ` (kalan ${fmtDur(x.until - now())})` : ''}`).join('\n') : '> Bos.')], ephemeral: true });
    if (sub === 'egg') {
      const tur = i.options.getString('tur');
      const it = SHOP.find(s => s.id === tur);
      if (u.balance < it.price) return i.reply({ embeds: [ERR(`Yetersiz bakiye: ${balF(it.price)} gerekli.`)], ephemeral: true });
      u.balance -= it.price;
      const pet = rollPet(tur);
      u.pets.push(pet); addXP(i.user.id, 30);
      return i.reply({ embeds: [E(RARITIES[pet.rarity].color).setTitle('YUMURTA ACILDI!').setDescription(`**${pet.emoji} ${pet.name}**\n**Nadirlik:** ${RARITIES[pet.rarity].label}\n**Boost:** +${pet.boost}\n**Deger:** ${balF(RARITIES[pet.rarity].value)}\n\n> Kusan: \`/robux equip id:${pet.id}\``)] });
    }
    if (sub === 'pets') {
      const t = i.options.getUser('uye') || i.user;
      const tu = uconf(t.id);
      if (!tu.pets.length) return i.reply({ embeds: [E().setTitle('PET KOLEKSIYONU').setDescription('> Pet yok. `/robux egg` ile yumurta ac!')] });
      const lines = [];
      for (const r of Object.keys(RARITIES).reverse()) {
        const pets = tu.pets.filter(p => p.rarity === r);
        if (pets.length) lines.push(`**${RARITIES[r].label}:**\n${pets.map(p => `${p.emoji} ${p.name} ${p.equipped ? '(KUSANILMIS)' : ''} — \`id:${p.id}\``).join('\n')}`);
      }
      return i.reply({ embeds: [E(0x9B59B6).setTitle(`${t.tag} — KOLEKSIYON`).setDescription(lines.join('\n\n') + `\n\n-# Toplam ${tu.pets.length} pet • Kusanilan ${tu.pets.filter(p => p.equipped).length}`)] });
    }
    if (sub === 'petbilgi') {
      const pid = i.options.getString('id');
      const pet = u.pets.find(p => p.id === pid);
      if (!pet) return i.reply({ embeds: [ERR('Bu ID sende kayitli degil. `/robux pets` ile IDleri gor.')], ephemeral: true });
      const R = RARITIES[pet.rarity];
      return i.reply({ embeds: [E(R.color).setTitle(`PET BILGISI: ${pet.emoji} ${pet.name}`).setDescription(
        `**Nadirlik:** ${R.label}\n**Boost:** +${pet.boost} R$ / kazanc\n**Tahmini deger:** ${balF(R.value)}\n**Durum:** ${pet.equipped ? 'KUSANILMIS' : 'Bosta'}\n**Alindigi tarih:** <t:${Math.floor(pet.obtained / 1000)}:f>\n**ID:** \`${pet.id}\``)] });
    }
    if (sub === 'petindex') {
      const lines = Object.keys(RARITIES).map(r => {
        const R = RARITIES[r];
        return `**${R.label}** — Sans: %${R.chance} • Boost: +${R.boost} • Deger: ${balF(R.value)}`;
      });
      return i.reply({ embeds: [E(0xE91E63).setTitle('PET INDEX / KATALOG').setDescription(
        `**Nadirlik tablosu (Normal yumurta):**\n${lines.join('\n')}\n\n**Yumurta oranlari:**\n> Premium: RARE+ garanti, EPIC+ %40\n> Mystic: LEGENDARY %75 / MYSTIC %25\n\n**Tum pet turleri:**\n${PETS_POOL.map(p => `${p.emoji} ${p.name}`).join(' • ')}\n\n-# Her pet her nadirlikte cikabilir. Kusanilan petler kazancina boost ekler (max 3).`)] });
    }
    if (sub === 'equip') {
      const pid = i.options.getString('id');
      const pet = u.pets.find(p => p.id === pid);
      if (!pet) return i.reply({ embeds: [ERR('Pet bulunamadi.')], ephemeral: true });
      if (pet.equipped) { pet.equipped = false; return i.reply({ embeds: [OKC(`${pet.emoji} ${pet.name} cikarildi.`)] }); }
      if (u.pets.filter(p => p.equipped).length >= 3) return i.reply({ embeds: [ERR('Max 3 pet kusanilabilir.')], ephemeral: true });
      pet.equipped = true;
      return i.reply({ embeds: [OKC(`${pet.emoji} ${pet.name} kusanildi: +${pet.boost} boost.`)] });
    }
    if (sub === 'liderler') {
      const top = Object.entries(DB.users).sort((a, b) => (b[1].balance + b[1].bank) - (a[1].balance + a[1].bank)).slice(0, 10);
      return i.reply({ embeds: [E(0xFEE75C).setTitle('ROBUX LIDERLERI').setDescription(top.map((t, x) => `**${x + 1}.** <@${t[0]}> — ${balF(t[1].balance + t[1].bank)}`).join('\n') || '> Veri yok.')] });
    }
    if (sub === 'bilgi') return i.reply({ embeds: [E(0x57F287).setTitle('ROBUX EKONOMI REHBERI').setDescription('> **Kazanma:** gunluk (streak+faiz), calis, ara, maden, balik, soygun\n**Oyunlar:** yazitura, bahis, duel\n**Pet:** egg → pets → petbilgi → petindex → equip (max 3, boost verir)\n**Trade:** `/robux trade @uye` → nakit/pet/esya takas\n**Banka:** yatir/cek → gunluk %2 faiz\n**Seviye:** her islem XP verir')] });
  }
});

/* ---------- GENEL ---------- */
CMDS.push({ data: new SlashCommandBuilder().setName('ping').setDescription('Gecikme'), async execute(i) { i.reply({ embeds: [E().setDescription(`> **PONG** — ${client.ws.ping}ms`)] }); } });
CMDS.push({
  data: new SlashCommandBuilder().setName('avatar').setDescription('Avatar').addUserOption(o => o.setName('uye').setDescription('Uye')),
  async execute(i) { const t = i.options.getUser('uye') || i.user; i.reply({ embeds: [E().setTitle(t.tag).setImage(t.displayAvatarURL({ size: 512 }))] }); }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('sunucu-bilgi').setDescription('Sunucu bilgisi').setDMPermission(false),
  async execute(i) {
    const g = i.guild; const bots = g.members.cache.filter(m => m.user.bot).size;
    i.reply({ embeds: [E().setTitle('SUNUCU BILGISI').setThumbnail(g.iconURL() || null).setDescription(`**Ad:** ${g.name}\n**Uye:** ${g.memberCount - bots} (+${bots} bot)\n**Kanal:** ${g.channels.cache.size}\n**Rol:** ${g.roles.cache.size}`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('üye-bilgi').setDescription('Uye karti').addUserOption(o => o.setName('uye').setDescription('Uye')),
  async execute(i) {
    const t = i.options.getMember('uye') || i.member;
    i.reply({ embeds: [E().setTitle('UYE KARTI').setThumbnail(t.user.displayAvatarURL()).setDescription(`**Ad:** ${t.user.tag}\n**Katilim:** <t:${Math.floor(t.joinedTimestamp / 1000)}:f>\n**Hesap:** <t:${Math.floor(t.user.createdTimestamp / 1000)}:f>`)] });
  }
});

/* ===================== TICKET FONK ===================== */
async function createTicket(i, reasonLabel) {
  const conf = gconf(i.guild.id).ticket;
  if (!conf) return i.reply({ embeds: [ERR('Ticket kurulu degil.')], ephemeral: true });
  const existing = Object.values(DB.tickets).find(t => t.guild === i.guild.id && t.owner === i.user.id && !t.closed);
  if (existing) return i.reply({ embeds: [ERR(`Zaten ticketin var: <#${existing.ch}>`)], ephemeral: true });
  let cat = i.guild.channels.cache.get(conf.categoryId);
  if (!cat) { cat = await i.guild.channels.create({ name: 'TICKETS', type: ChannelType.GuildCategory, permissionOverwrites: [{ id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }] }); conf.categoryId = cat.id; }
  const perms = [
    { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
  ];
  for (const r of conf.roles || []) perms.push({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  const ch = await i.guild.channels.create({ name: (`ticket-${i.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90)) || `ticket-${i.user.id}`, type: ChannelType.GuildText, parent: cat.id, topic: `Ticket: ${i.user.tag}`, permissionOverwrites: perms });
  DB.tickets[ch.id] = { guild: i.guild.id, owner: i.user.id, reason: reasonLabel, created: now(), closed: false };
  const eb = E().setTitle('TICKET').setDescription(`${conf.text || 'Yetkililer ilgilenecek.'}\n\n**Sebep:** ${reasonLabel}\n**Sahip:** ${i.user}`);
  if (conf.thumb && conf.thumb.startsWith('http')) eb.setThumbnail(conf.thumb);
  await ch.send({ content: [i.user.toString(), ...(conf.roles || []).map(r => `<@&${r}>`)].join(' '), embeds: [eb], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk:kapat').setLabel('Ticketi Kapat').setStyle(ButtonStyle.Danger))] });
  await i.reply({ embeds: [OKC(`Ticket: ${ch}`)], ephemeral: true });
  saveDB();
}
async function closeTicket(i) {
  const t = DB.tickets[i.channel.id]; if (!t) return;
  t.closed = true;
  const msgs = await i.channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (msgs) {
    const txt = msgs.reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString('tr-TR')}] ${m.author.tag}: ${m.content || '(ek)'}`).join('\n');
    const logCh = i.guild.channels.cache.get(gconf(i.guild.id).modlog);
    if (logCh) await logCh.send({ content: `**Transcript** — <@${t.owner}>`, files: [new AttachmentBuilder(Buffer.from(txt, 'utf8'), { name: `transcript-${i.channel.name}.txt` })] }).catch(() => {});
  }
  delete DB.tickets[i.channel.id]; saveDB();
  await i.channel.delete().catch(() => {});
}
async function finalizeTicket(i, st, cats) {
  const ch = i.guild.channels.cache.get(st.kanal);
  if (!ch) return refresh(i, { embeds: [ERR('Kanal yok.')], components: [] });
  gconf(i.guild.id).ticket = { mode: st.mode, channel: st.kanal, roles: st.roller || [], thumb: st.thumb, text: st.metin, cats, categoryId: null };
  const eb = E().setTitle('HELP & SUPPORT').setDescription(st.metin);
  if (st.thumb && st.thumb.startsWith('http')) eb.setThumbnail(st.thumb);
  const comps = [];
  if (st.mode === 'kategorili' && cats.length) comps.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tk:secim').setPlaceholder('Kategori sec...').addOptions(cats.map(c => ({ label: c, value: c })))));
  else comps.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tkpanel:create').setLabel('Ticket Olustur').setStyle(ButtonStyle.Primary)));
  await ch.send({ embeds: [eb], components: comps });
  STATE.delete(sKey(i) + ':tk');
  return refresh(i, { embeds: [OKC(`Panel kuruldu: ${ch}`)], components: [] });
}

/* ===================== BASVURU FONK ===================== */
function appLogEmbed(a) {
  const renk = a.status === 'KABUL' ? 0x57F287 : a.status === 'RED' ? 0xED4245 : a.status === 'INCELEMEDE' ? 0xFEE75C : 0x5865F2;
  return E(renk).setTitle(`YENI BASVURU #${a.id}`).setDescription(`**Basvuran:** <@${a.user}>\n**Tarih:** <t:${Math.floor(a.time / 1000)}:f>\n**Durum:** \`${a.status}\`\n\n> **Basvuruyu Gor** (yonetici)`);
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
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('app:rol').setPlaceholder('Kabul rolu').setMinValues(0).setMaxValues(1)),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app:metin').setLabel('Panel Metni').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('app:addsoru').setLabel('Soru Ekle').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('app:kur').setLabel('Sistemi Kur').setStyle(ButtonStyle.Success))
  ];
  if (st.sorular.length) {
    const btns = st.sorular.map((s, x) => new ButtonBuilder().setCustomId(`app:sorusil:${x}`).setLabel(`X ${x + 1}. ${s.slice(0, 20)}`).setStyle(ButtonStyle.Danger));
    for (let x = 0; x < btns.length; x += 5) rows.push(new ActionRowBuilder().addComponents(btns.slice(x, x + 5)));
  }
  return refresh(i, { embeds: [E().setTitle('Basvuru Kurulum').setDescription(`**Panel:** ${st.kanal ? `<#${st.kanal}>` : 'X'}\n**Log:** ${st.log ? `<#${st.log}>` : 'X'}\n**Metin:** ${st.metin ? 'OK' : 'X'}\n**Sorular (${st.sorular.length}):**\n${st.sorular.map((s, x) => `> \`{${x + 1}}\` ${s}`).join('\n') || '> yok'}`)], components: rows });
}
async function askQuestionDM(dm, user, conf, answers, current) {
  const q = conf.sorular[current];
  const existing = answers[current];
  const qMsg = await dm.send({
    embeds: [E().setTitle(`Soru ${current + 1}/${conf.sorular.length}`).setDescription(`**${q}**${existing ? `\n\n-# Mevcut cevap: ${existing.slice(0, 100)}` : ''}\n\n> Cevabini bu kanala yaz.`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app:dm:prev').setLabel('◀ Onceki Soru').setStyle(ButtonStyle.Secondary).setDisabled(current === 0),
      new ButtonBuilder().setCustomId('app:dm:cancel').setLabel('Iptal').setStyle(ButtonStyle.Danger))]
  });
  const collector = qMsg.createMessageComponentCollector({ filter: c => c.user.id === user.id, time: 300000 });
  const msgCollector = dm.createMessageCollector({ filter: m => m.author.id === user.id, time: 300000 });
  const result = await new Promise((resolve) => {
    collector.on('collect', async c => { collector.stop(); msgCollector.stop(); await c.deferUpdate().catch(() => {}); resolve({ action: c.customId }); });
    msgCollector.on('collect', async m => { collector.stop(); msgCollector.stop(); m.delete().catch(() => {}); resolve({ action: 'answer', text: m.content.trim() }); });
    collector.on('end', (_, r) => { if (r === 'time') resolve({ action: 'timeout' }); });
    msgCollector.on('end', (_, r) => { if (r === 'time') resolve({ action: 'timeout' }); });
  });
  return result;
}
async function runAppFormDM(user, conf) {
  const dm = await user.createDM();
  const answers = new Array(conf.sorular.length).fill('');
  const intro = await dm.send({ embeds: [E().setTitle('Basvuru Formu').setDescription(`> ${conf.sorular.length} soru. Butonlarla **onceki soruya donebilirsin**.\n> Cevaplari mesaj olarak yazman yeterli.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('app:dm:start').setLabel('Basla').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('app:dm:cancel').setLabel('Iptal').setStyle(ButtonStyle.Danger))] });
  const startClick = await intro.awaitMessageComponent({ filter: c => c.user.id === user.id, time: 120000 }).catch(() => null);
  if (!startClick || startClick.customId === 'app:dm:cancel') { if (startClick) await startClick.update({ embeds: [ERR('Iptal.')], components: [] }); return null; }
  await startClick.update({ embeds: [E().setDescription('> Basladi!')], components: [] });
  let current = 0;
  while (current < conf.sorular.length) {
    const res = await askQuestionDM(dm, user, conf, answers, current);
    if (!res || res.action === 'timeout' || res.action === 'app:dm:cancel') { await dm.send({ embeds: [ERR('Basvuru iptal/sure doldu.')] }).catch(() => {}); return null; }
    if (res.action === 'app:dm:prev') { current = Math.max(0, current - 1); continue; }
    answers[current] = res.text; current++;
  }
  const confirm = await dm.send({ embeds: [E().setTitle('Onay').setDescription(answers.map((a, x) => `**${x + 1}.** ${conf.sorular[x]}\n> ${a}`).join('\n\n'))], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('app:dm:submit').setLabel('Gonder').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('app:dm:cancel').setLabel('Iptal').setStyle(ButtonStyle.Danger))] });
  const cc = await confirm.awaitMessageComponent({ filter: c => c.user.id === user.id, time: 300000 }).catch(() => null);
  if (!cc || cc.customId !== 'app:dm:submit') { if (cc) await cc.update({ embeds: [ERR('Iptal.')], components: [] }); return null; }
  await cc.update({ embeds: [OKC('Basvurun alindi!')], components: [] });
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

      /* ---------- OWNER PANEL ---------- */
      if (id.startsWith('ownp:')) {
        if (!isOwner(i.user)) return i.reply({ embeds: [ERR('Sadece owner.')], ephemeral: true });
        const act = id.split(':')[1];
        await i.deferUpdate().catch(() => {});
        const panel = { embeds: [ownerPanelEmbed()], components: ownerRows() };
        if (act === 'admins') return i.editReply({ embeds: [E(0xF1C40F).setTitle('ADMIN LISTESI').setDescription(DB.admins.length ? DB.admins.map(a => `<@${a}> — \`${a}\``).join('\n') : '> Admin yok.')], components: ownerRows() });
        if (act === 'adminadd') {
          const u2 = await collectUser(i, '> **Bot admini** yapilacak uye? (ID/mention/ad)');
          if (!u2) return i.editReply(panel);
          if (!DB.admins.includes(u2.id)) DB.admins.push(u2.id);
          saveDB();
          return i.editReply({ embeds: [OKC(`${u2.tag} artik **bot admini**. /admin kullanabilir.`)], components: ownerRows() });
        }
        if (act === 'adminrem') {
          const u2 = await collectUser(i, '> Adminligi alinacak uye?');
          if (!u2) return i.editReply(panel);
          DB.admins = DB.admins.filter(a => a !== u2.id); saveDB();
          return i.editReply({ embeds: [OKC(`${u2.tag} adminlikten alindi.`)], components: ownerRows() });
        }
        if (act === 'pet') {
          const u2 = await collectUser(i, '> Pet verilecek uye?');
          if (!u2) return i.editReply(panel);
          const rar = (await collectChannel(i, '> Nadirlik? (COMMON/UNCOMMON/RARE/EPIC/LEGENDARY/MYSTIC)') || '').toUpperCase();
          if (!RARITIES[rar]) return i.editReply({ embeds: [ERR('Gecersiz nadirlik.')], components: ownerRows() });
          const pet = rollPet('egg_normal'); pet.rarity = rar; pet.boost = RARITIES[rar].boost;
          pet.id = `${rar.toLowerCase()}_${pet.name.toLowerCase().replace(/[^a-z]/g, '')}_own_${Date.now().toString(36)}`;
          uconf(u2.id).pets.push(pet); saveDB();
          return i.editReply({ embeds: [OKC(`${u2.tag} uyesine **${rar}** ${pet.emoji} ${pet.name} verildi.`)], components: ownerRows() });
        }
        if (act === 'bal') {
          const u2 = await collectUser(i, '> Bakiyesi ayarlanacak uye?');
          if (!u2) return i.editReply(panel);
          const n = parseInt(await collectChannel(i, '> Yeni bakiye?') || '');
          if (isNaN(n)) return i.editReply({ embeds: [ERR('Gecersiz sayi.')], components: ownerRows() });
          uconf(u2.id).balance = n; saveDB();
          return i.editReply({ embeds: [OKC(`${u2.tag} bakiyesi ${balF(n)} yapildi.`)], components: ownerRows() });
        }
        if (act === 'item') {
          const u2 = await collectUser(i, '> Esya verilecek uye?');
          if (!u2) return i.editReply(panel);
          const itid = await collectChannel(i, '> Esya ID? (boost2x / sans / vip / egg_normal / egg_premium / egg_mystic)');
          if (!SHOP.find(s => s.id === itid)) return i.editReply({ embeds: [ERR('Gecersiz esya.')], components: ownerRows() });
          uconf(u2.id).inv.push({ id: itid, until: itid === 'boost2x' ? now() + 3600000 : null }); saveDB();
          return i.editReply({ embeds: [OKC(`${u2.tag} uyesine ${itid} verildi.`)], components: ownerRows() });
        }
        if (act === 'reset') {
          const u2 = await collectUser(i, '> Sifirlanacak uye?');
          if (!u2) return i.editReply(panel);
          DB.users[u2.id] = { balance: 0, bank: 0, inv: [], badges: [], pets: [], xp: 0, level: 1, streak: 0, lastDaily: 0, cd: { daily: 0, work: 0, ara: 0, mine: 0, fish: 0, heist: 0 } };
          saveDB();
          return i.editReply({ embeds: [OKC(`${u2.tag} sifirlandi.`)], components: ownerRows() });
        }
        if (act === 'give') {
          const n = parseInt(await collectChannel(i, '> Kendine eklenecek miktar?') || '');
          if (isNaN(n)) return i.editReply({ embeds: [ERR('Gecersiz.')], components: ownerRows() });
          uconf(i.user.id).balance += n; saveDB();
          return i.editReply({ embeds: [OKC(`Eklendi. Yeni bakiye: ${balF(uconf(i.user.id).balance)}`)], components: ownerRows() });
        }
        if (act === 'global') {
          const txt = await collectChannel(i, '> Global mesaj metni?');
          if (!txt) return i.editReply(panel);
          let okc = 0, fail = 0;
          for (const g of client.guilds.cache.values()) {
            const ch = g.systemChannel || g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages));
            if (ch) { try { await ch.send({ embeds: [E(0x57F287).setTitle('Studioblox Global Duyuru').setDescription(txt).setFooter({ text: 'Bot sahibinden' })] }); okc++; } catch (e) { fail++; } } else fail++;
            await new Promise(r => setTimeout(r, 200));
          }
          return i.editReply({ embeds: [OKC(`Global: ${okc} basarili, ${fail} basarisiz.`)], components: ownerRows() });
        }
        return i.editReply(panel);
      }

      /* ---------- ADMIN PANEL ---------- */
      if (id.startsWith('adminp:')) {
        if (!isAdminBot(i.user.id)) return i.reply({ embeds: [ERR('Bot admini degilsin.')], ephemeral: true });
        const act = id.split(':')[1];
        await i.deferUpdate().catch(() => {});
        const panel = { embeds: [E(0x3498DB).setTitle('ADMIN PANEL').setDescription('> Bot admin aracları.')], components: adminRows() };
        if (act === 'pet') {
          const u2 = await collectUser(i, '> Pet verilecek uye?');
          if (!u2) return i.editReply(panel);
          const rar = (await collectChannel(i, '> Nadirlik? (COMMON...MYSTIC)') || '').toUpperCase();
          if (!RARITIES[rar]) return i.editReply({ embeds: [ERR('Gecersiz nadirlik.')], components: adminRows() });
          const pet = rollPet('egg_normal'); pet.rarity = rar; pet.boost = RARITIES[rar].boost;
          pet.id = `${rar.toLowerCase()}_${pet.name.toLowerCase().replace(/[^a-z]/g, '')}_adm_${Date.now().toString(36)}`;
          uconf(u2.id).pets.push(pet); saveDB();
          return i.editReply({ embeds: [OKC(`${u2.tag} uyesine **${rar}** pet verildi.`)], components: adminRows() });
        }
        if (act === 'bal') {
          const u2 = await collectUser(i, '> Bakiyesi ayarlanacak uye?');
          if (!u2) return i.editReply(panel);
          const n = parseInt(await collectChannel(i, '> Yeni bakiye?') || '');
          if (isNaN(n)) return i.editReply({ embeds: [ERR('Gecersiz.')], components: adminRows() });
          uconf(u2.id).balance = n; saveDB();
          return i.editReply({ embeds: [OKC(`${u2.tag} → ${balF(n)}`)], components: adminRows() });
        }
        if (act === 'item') {
          const u2 = await collectUser(i, '> Esya verilecek uye?');
          if (!u2) return i.editReply(panel);
          const itid = await collectChannel(i, '> Esya ID?');
          if (!SHOP.find(s => s.id === itid)) return i.editReply({ embeds: [ERR('Gecersiz.')], components: adminRows() });
          uconf(u2.id).inv.push({ id: itid, until: itid === 'boost2x' ? now() + 3600000 : null }); saveDB();
          return i.editReply({ embeds: [OKC(`${itid} verildi.`)], components: adminRows() });
        }
        if (act === 'view') {
          const u2 = await collectUser(i, '> Bakiyesi gorulecek uye?');
          if (!u2) return i.editReply(panel);
          const tu = uconf(u2.id);
          return i.editReply({ embeds: [E(0x3498DB).setTitle(`BAKIYE: ${u2.tag}`).setDescription(`**Cuzdan:** ${balF(tu.balance)}\n**Banka:** ${balF(tu.bank)}\n**Seviye:** ${tu.level}\n**Pet:** ${tu.pets.length}`)], components: adminRows() });
        }
        return i.editReply(panel);
      }

      /* ---------- TRADE ---------- */
      if (id.startsWith('trade:')) {
        const [, act, tid] = id.split(':');
        const t = STATE.get('trade:' + tid);
        if (!t) return i.update({ embeds: [ERR('Trade oturumu bitti.')], components: [] });
        if (i.user.id !== t.from && i.user.id !== t.to) return i.reply({ embeds: [ERR('Bu trade senin degil.')], ephemeral: true });
        const side = i.user.id === t.from ? 'from' : 'to';
        const off = side === 'from' ? t.fromOffer : t.toOffer;
        if (act === 'cancel') { STATE.delete('trade:' + tid); return i.update({ embeds: [ERR('Trade iptal edildi.')], components: [] }); }
        if (act === 'reset') { off.cash = 0; off.pets = []; off.items = []; t.conf[side] = false; t.exp = now() + 300000; await i.deferUpdate(); return tradeUpdate(t); }
        if (act === 'confirm') {
          t.conf[side] = true;
          if (t.conf.from && t.conf.to) { STATE.delete('trade:' + tid); return executeTrade(t); }
          t.exp = now() + 300000; await i.deferUpdate(); return tradeUpdate(t);
        }
        if (act === 'cash') {
          await i.deferUpdate();
          const val = parseInt(await collectChannel(i, '> Teklifine eklenecek **nakit** miktari?') || '');
          if (!val || val < 1) { t.exp = now() + 300000; return tradeUpdate(t); }
          off.cash += val; t.conf[side] = false; t.exp = now() + 300000;
          return tradeUpdate(t);
        }
        if (act === 'pet') {
          const u = uconf(i.user.id);
          const opts = u.pets.filter(p => !p.equipped && !off.pets.some(x => x.id === p.id)).slice(0, 25).map(p => ({ label: `${p.emoji} ${p.name} (${p.rarity})`, value: p.id }));
          if (!opts.length) return i.reply({ embeds: [ERR('Teklif edilebilir (bosta) petin yok.')], ephemeral: true });
          return i.reply({ embeds: [E().setDescription('> Teklife eklenecek peti sec:')], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`trade:petsel:${tid}`).setPlaceholder('Pet sec...').addOptions(opts))], ephemeral: true });
        }
        if (act === 'item') {
          const u = uconf(i.user.id);
          const opts = u.inv.slice(0, 25).map((it, x) => ({ label: `[${x}] ${it.id}`, value: String(x) }));
          if (!opts.length) return i.reply({ embeds: [ERR('Esyan yok.')], ephemeral: true });
          return i.reply({ embeds: [E().setDescription('> Teklife eklenecek esyayi sec:')], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`trade:itemsel:${tid}`).setPlaceholder('Esya sec...').addOptions(opts))], ephemeral: true });
        }
        return;
      }

      /* ---------- TICKET ---------- */
      if (id === 'tk:iptal') { STATE.delete(sKey(i) + ':tk'); STATE.delete(sKey(i) + ':mq'); return refresh(i, { embeds: [ERR('Iptal.')], components: [] }); }
      if (id.startsWith('tk:mode:')) {
        const st = STATE.get(sKey(i) + ':tk') || {};
        st.mode = id.split(':')[2]; st.exp = now() + 900000;
        STATE.set(sKey(i) + ':tk', st);
        return refresh(i, {
          embeds: [E().setTitle('Ticket Kurulum — Adim 2').setDescription(`Tip: **${st.mode === 'kategorili' ? 'Kategorili' : 'Kategorisiz'}**`)],
          components: [
            new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('tk:kanal').setPlaceholder('Panel kanali').setChannelTypes([ChannelType.GuildText])),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('tk:rol').setPlaceholder('Etiket roller').setMinValues(0).setMaxValues(5)),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('tk:devam').setLabel('Devam →').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('tk:iptal').setLabel('Iptal').setStyle(ButtonStyle.Danger))]
        });
      }
      if (id === 'tk:devam') {
        const st = STATE.get(sKey(i) + ':tk');
        if (!st || !st.kanal) return refresh(i, { embeds: [ERR('Once kanal sec.')], components: [] });
        await i.deferUpdate().catch(() => {});
        const thumb = await collectChannel(i, '> **1/2 THUMBNAIL** — URL veya `-`:');
        if (thumb === null) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.thumb = thumb === '-' ? null : thumb;
        const metin = await collectChannel(i, '> **2/2 PANEL MESAJI** — Panel aciklamasi:');
        if (!metin) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.metin = metin;
        if (st.mode === 'kategorili') {
          const kats = await collectChannel(i, '> **KATEGORILER** — her satira 1:');
          if (!kats) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
          st.cats = kats.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 10);
        } else st.cats = [];
        STATE.set(sKey(i) + ':tk', st);
        return finalizeTicket(i, st, st.cats || []);
      }
      if (id === 'tkpanel:create') return createTicket(i, 'Genel Destek');
      if (id === 'tk:kapat') return i.reply({ embeds: [E(0xED4245).setDescription('> **Kapatilsin mi?** Transcript loga gider.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk:kapat:onay').setLabel('Evet, Kapat').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('tk:kapat:vaz').setLabel('Vazgec').setStyle(ButtonStyle.Secondary))], ephemeral: true });
      if (id === 'tk:kapat:vaz') return i.update({ embeds: [OKC('Vazgecildi.')], components: [] });
      if (id === 'tk:kapat:onay') { await i.update({ embeds: [OKC('Kapatiliyor...')], components: [] }); return closeTicket(i); }
      if (id === 'mq:kur') {
        const st = STATE.get(sKey(i) + ':mq');
        if (!st || !st.kanal) return refresh(i, { embeds: [ERR('Kanal sec.')], components: [] });
        const ch = i.guild.channels.cache.get(st.kanal);
        gconf(i.guild.id).ticket = { mode: 'kategorili', channel: st.kanal, roles: st.roller || [], thumb: CONFIG.mequeenBanner, text: MEQUEEN_TEXT, cats: MEQUEEN_CATS, categoryId: null };
        const eb = E().setTitle('MEQUEEN STUDIO — HELP & SUPPORT').setDescription(MEQUEEN_TEXT);
        if (CONFIG.mequeenBanner && CONFIG.mequeenBanner.startsWith('http')) eb.setThumbnail(CONFIG.mequeenBanner);
        await ch.send({ embeds: [eb], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tk:secim').setPlaceholder('Kategori sec...').addOptions(MEQUEEN_CATS.map(c => ({ label: c, value: c }))))] });
        STATE.delete(sKey(i) + ':mq');
        return refresh(i, { embeds: [OKC(`Panel: ${ch}`)], components: [] });
      }

      /* ---------- DUYURU ---------- */
      if (id === 'ann:gonder') {
        const st = STATE.get(sKey(i) + ':ann');
        if (!st) return i.update({ embeds: [ERR('Oturum yok.')], components: [] });
        const ch = i.guild.channels.cache.get(st.kanal || i.channel.id);
        if (!ch) return i.update({ embeds: [ERR('Kanal yok.')], components: [] });
        let content = '';
        if (st.mention === 'everyone') content = '@everyone';
        if (st.mention === 'here') content = '@here';
        if (st.mention === 'rol' && st.rol) content = `<@&${st.rol}>`;
        await ch.send({ content, embeds: [annEmbed(st, i.user)] });
        STATE.delete(sKey(i) + ':ann');
        return i.update({ embeds: [OKC(`Gonderildi: ${ch}`)], components: [] });
      }
      if (id === 'ann:iptal') { STATE.delete(sKey(i) + ':ann'); return i.update({ embeds: [ERR('Iptal.')], components: [] }); }

      /* ---------- CEKILIS ---------- */
      if (id.startsWith('gw:join:')) {
        const g = DB.giveaways[id.split(':')[2]];
        if (!g || g.ended) return i.reply({ embeds: [ERR('Aktif degil.')], ephemeral: true });
        if (g.roleReq && !i.member.roles.cache.has(g.roleReq)) return i.reply({ embeds: [ERR('Rol sarti var.')], ephemeral: true });
        const idx = g.parts.indexOf(i.user.id);
        if (idx > -1) { g.parts.splice(idx, 1); return i.reply({ embeds: [ERR('Katilim cekildi.')], ephemeral: true }); }
        g.parts.push(i.user.id);
        return i.reply({ embeds: [OKC('Katildin!')], ephemeral: true });
      }
      if (id === 'gw:info') {
        const gg = DB.giveaways[i.message.id];
        if (!gg) return i.reply({ embeds: [ERR('Yok.')], ephemeral: true });
        return i.reply({ embeds: [E().setTitle('Katilimcilar').setDescription(gg.parts.length ? gg.parts.map(p => `<@${p}>`).join('\n') : '> Yok.')], ephemeral: true });
      }

      /* ---------- BASVURU KURULUM ---------- */
      if (id === 'app:metin') {
        const st = STATE.get(sKey(i) + ':app'); if (!st) return refresh(i, { embeds: [ERR('Oturum yok.')], components: [] });
        await i.deferUpdate().catch(() => {});
        const baslik = await collectChannel(i, '> **PANEL BASLIGI**:');
        if (!baslik) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        const acik = await collectChannel(i, '> **PANEL ACIKLAMASI**:');
        if (!acik) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.metin = { baslik, acik };
        return appSetupUpdate(i);
      }
      if (id === 'app:addsoru') {
        const st = STATE.get(sKey(i) + ':app'); if (!st) return refresh(i, { embeds: [ERR('Oturum yok.')], components: [] });
        if (st.sorular.length >= 15) return i.reply({ embeds: [ERR('Max 15.')], ephemeral: true });
        await i.deferUpdate().catch(() => {});
        const soru = await collectChannel(i, `> **SORU ${st.sorular.length + 1}**:`);
        if (!soru) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.sorular.push(soru);
        return appSetupUpdate(i);
      }
      if (id.startsWith('app:sorusil:')) { const st = STATE.get(sKey(i) + ':app'); if (st) st.sorular.splice(parseInt(id.split(':')[2]), 1); return appSetupUpdate(i); }
      if (id === 'app:kur') {
        const st = STATE.get(sKey(i) + ':app');
        if (!st || !st.kanal || !st.log || !st.metin || !st.sorular.length) return refresh(i, { embeds: [ERR('Eksik alan var.')], components: [] });
        const ch = i.guild.channels.cache.get(st.kanal);
        gconf(i.guild.id).app = { panel: st.kanal, log: st.log, rol: st.rol || null, metin: st.metin, sorular: st.sorular };
        await ch.send({ embeds: [E().setTitle(st.metin.baslik).setDescription(st.metin.acik)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('app:apply').setLabel('Basvuru Yap').setStyle(ButtonStyle.Primary))] });
        STATE.delete(sKey(i) + ':app');
        return refresh(i, { embeds: [OKC(`Kurulum: ${ch}`)], components: [] });
      }
      if (id === 'app:apply') {
        const conf = gconf(i.guild.id).app;
        if (!conf) return i.reply({ embeds: [ERR('Kurulu degil.')], ephemeral: true });
        await i.reply({ embeds: [E().setDescription('> **Form DM\'inde.** Butonlarla geri donebilirsin.')], ephemeral: true });
        const answers = await runAppFormDM(i.user, conf);
        if (!answers) return i.editReply({ embeds: [ERR('Basvuru iptal/sure doldu.')], components: [] });
        const aid = rnd(1000, 9999);
        DB.apps[aid] = { id: aid, guild: i.guild.id, user: i.user.id, qa: conf.sorular.map((q, x) => ({ q, a: answers[x] || '-' })), status: 'YENI', time: now() };
        const logCh = i.guild.channels.cache.get(conf.log);
        if (logCh) await logCh.send({ embeds: [appLogEmbed(DB.apps[aid])], components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`app:view:${aid}`).setLabel('Basvuruyu Gor').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`app:accept:${aid}`).setLabel('Kabul Et').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`app:reject:${aid}`).setLabel('Reddet').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`app:hold:${aid}`).setLabel('Beklemeye Al').setStyle(ButtonStyle.Secondary))] });
        saveDB();
        return i.editReply({ embeds: [OKC('Basvurun alindi!')], components: [] });
      }
      if (id.startsWith('app:view:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yonetici only.')], ephemeral: true });
        const a = DB.apps[id.split(':')[2]];
        if (!a) return i.reply({ embeds: [ERR('Yok.')], ephemeral: true });
        return i.reply({ embeds: [E().setTitle(`BASVURU #${a.id}`).setDescription(a.qa.map((q, x) => `**S${x + 1}:** ${q.q}\n> ${q.a}`).join('\n\n'))], ephemeral: true });
      }
      if (id.startsWith('app:accept:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
        const a = DB.apps[id.split(':')[2]]; if (!a) return i.reply({ embeds: [ERR('Yok.')], ephemeral: true });
        a.status = 'KABUL';
        const conf = gconf(i.guild.id).app;
        const m = i.guild.members.cache.get(a.user);
        if (m && conf && conf.rol) await m.roles.add(conf.rol).catch(() => {});
        dmUser(await client.users.fetch(a.user), E(0x57F287).setDescription(`> **KABUL**\n**${i.guild.name}** basvurun kabul edildi!`));
        await appLogUpdate(i, a);
        return i.reply({ embeds: [OKC('Kabul edildi.')], ephemeral: true });
      }
      if (id.startsWith('app:reject:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
        await i.deferUpdate().catch(() => {});
        const sebep = await collectChannel(i, '> **RED SEBEBI** (DM gider):');
        if (!sebep) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        const a = DB.apps[id.split(':')[2]]; if (!a) return refresh(i, { embeds: [ERR('Yok.')], components: [] });
        a.status = 'RED';
        dmUser(await client.users.fetch(a.user), E(0xED4245).setDescription(`> **RED**\n**${i.guild.name}** basvurun reddedildi.\n> Sebep: ${sebep}`));
        await appLogUpdate(i, a);
        return refresh(i, { embeds: [OKC('Reddedildi.')], components: [] });
      }
      if (id.startsWith('app:hold:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
        const a = DB.apps[id.split(':')[2]]; if (!a) return i.reply({ embeds: [ERR('Yok.')], ephemeral: true });
        a.status = 'INCELEMEDE';
        dmUser(await client.users.fetch(a.user), E(0xFEE75C).setDescription(`> **INCELEME**\n**${i.guild.name}** basvurun incelemeye alindi.`));
        await appLogUpdate(i, a);
        return i.reply({ embeds: [OKC('Incelemeye alindi.')], ephemeral: true });
      }

      /* ---------- DM AT ---------- */
      if (id.startsWith('dm:target:')) {
        const st = STATE.get(sKey(i) + ':dm') || { exp: now() + 600000 };
        st.target = id.split(':')[2];
        STATE.set(sKey(i) + ':dm', st);
        await i.deferUpdate().catch(() => {});
        if (st.target === 'uye') {
          const raw = await collectChannel(i, '> **UYE** — ID / mention / **kullanici adi**:');
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
        }
        const metin = await collectChannel(i, '> **DM METNI**:');
        if (!metin) return refresh(i, { embeds: [ERR('Sure doldu.')], components: [] });
        st.metin = metin;
        const hedef = st.target === 'everyone' ? 'Tum uyeler' : st.target === 'here' ? 'Cevrimici uyeler' : `<@${st.member}>`;
        return i.followUp({ embeds: [E().setTitle('DM ONIZLEME').setDescription(`**Hedef:** ${hedef}\n\n> ${st.metin}`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dm:onay').setLabel('Gonder').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dm:iptal').setLabel('Iptal').setStyle(ButtonStyle.Danger))], ephemeral: true });
      }
      if (id === 'dm:onay') {
        const st = STATE.get(sKey(i) + ':dm');
        if (!st || !st.metin) return i.update({ embeds: [ERR('Veri eksik.')], components: [] });
        await i.update({ embeds: [E().setDescription('> Gonderiliyor...')], components: [] });
        let targets = [];
        if (st.target === 'everyone') targets = (await i.guild.members.fetch()).filter(m => !m.user.bot).map(m => m.user);
        if (st.target === 'here') targets = i.guild.members.cache.filter(m => !m.user.bot && m.presence && m.presence.status !== 'offline').map(m => m.user);
        if (st.target === 'uye' && st.member) targets = [await client.users.fetch(st.member).catch(() => null)].filter(Boolean);
        let okc = 0, fail = 0;
        for (const u of targets) { const sent = await dmUser(u, { content: st.metin }); sent ? okc++ : fail++; await new Promise(r => setTimeout(r, 350)); }
        STATE.delete(sKey(i) + ':dm');
        return i.editReply({ embeds: [E(0x57F287).setTitle('DM RAPORU').setDescription(`**Basarili:** ${okc}\n**Basarisiz:** ${fail}`)], components: [] });
      }
      if (id === 'dm:iptal') { STATE.delete(sKey(i) + ':dm'); return i.update({ embeds: [ERR('Iptal.')], components: [] }); }

      /* ---------- DUEL ---------- */
      if (id.startsWith('duel:accept:') || id.startsWith('duel:decline:')) {
        const d = STATE.get('duel:' + id.split(':')[2]);
        if (!d) return i.update({ embeds: [ERR('Zaman asimi.')], components: [] });
        if (i.user.id !== d.to) return i.reply({ embeds: [ERR('Sana ait degil.')], ephemeral: true });
        STATE.delete('duel:' + id.split(':')[2]);
        if (id.startsWith('duel:decline:')) return i.update({ embeds: [ERR('Reddedildi.')], components: [] });
        const a = uconf(d.from), b = uconf(d.to);
        if (a.balance < d.amt || b.balance < d.amt) return i.update({ embeds: [ERR('Bakiye yetersiz.')], components: [] });
        const r1 = rnd(1, 100), r2 = rnd(1, 100);
        const win = r1 === r2 ? null : (r1 > r2 ? d.from : d.to);
        if (win === d.from) { a.balance += d.amt; b.balance -= d.amt; }
        else if (win === d.to) { b.balance += d.amt; a.balance -= d.amt; }
        return i.update({ embeds: [E(0xFEE75C).setTitle('DUELLO SONUC').setDescription(`**${r1}** vs **${r2}**\n> ${win ? `Kazanan <@${win}>` : 'Berabere'}`)], components: [] });
      }

      /* ---------- MARKET ---------- */
      if (id.startsWith('shop:buy:')) {
        const it = SHOP.find(s => s.id === id.split(':')[2]);
        const u = uconf(i.user.id);
        if (!it) return i.reply({ embeds: [ERR('Urun yok.')], ephemeral: true });
        if (u.balance < it.price) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true });
        u.balance -= it.price;
        if (it.id.startsWith('egg_')) {
          const pet = rollPet(it.id);
          u.pets.push(pet); addXP(i.user.id, 30);
          return i.reply({ embeds: [E(RARITIES[pet.rarity].color).setTitle('YUMURTA ACILDI!').setDescription(`**${pet.emoji} ${pet.name}** — ${RARITIES[pet.rarity].label}\n> equip: \`/robux equip id:${pet.id}\``)], ephemeral: true });
        }
        u.inv.push({ id: it.id, until: it.id === 'boost2x' ? now() + 3600000 : null });
        if (it.id === 'vip' && !u.badges.includes('vip')) u.badges.push('vip');
        return i.reply({ embeds: [OKC(`Alindi: ${it.name}`)], ephemeral: true });
      }
    }

    /* ---------- SELECT MENUS ---------- */
    if (i.isChannelSelectMenu()) {
      const id = i.customId; const ch = i.channels.first();
      if (id === 'tk:kanal') { const st = STATE.get(sKey(i) + ':tk') || {}; st.kanal = ch.id; STATE.set(sKey(i) + ':tk', st); return refresh(i, { embeds: [E().setDescription(`> Kanal: ${ch}`)] }); }
      if (id === 'mq:kanal') { const st = STATE.get(sKey(i) + ':mq') || {}; st.kanal = ch.id; STATE.set(sKey(i) + ':mq', st); return refresh(i, { embeds: [E().setDescription(`> Kanal: ${ch}`)] }); }
      if (id === 'app:kanal') { const st = STATE.get(sKey(i) + ':app'); if (st) st.kanal = ch.id; return refresh(i, { embeds: [E().setDescription(`> Kanal: ${ch}`)] }); }
      if (id === 'app:log') { const st = STATE.get(sKey(i) + ':app'); if (st) st.log = ch.id; return refresh(i, { embeds: [E().setDescription(`> Log: ${ch}`)] }); }
      if (id === 'ann:kanal') { const st = STATE.get(sKey(i) + ':ann'); if (st) st.kanal = ch.id; return annPreview(i); }
    }
    if (i.isRoleSelectMenu()) {
      const id = i.customId;
      if (id === 'tk:rol') { const st = STATE.get(sKey(i) + ':tk') || {}; st.roller = i.roles.map(r => r.id); STATE.set(sKey(i) + ':tk', st); return refresh(i, { embeds: [E().setDescription(`> Roller: ${i.roles.map(r => r.toString()).join(' ') || 'yok'}`)] }); }
      if (id === 'mq:rol') { const st = STATE.get(sKey(i) + ':mq') || {}; st.roller = i.roles.map(r => r.id); STATE.set(sKey(i) + ':mq', st); return refresh(i, { embeds: [E().setDescription(`> Roller: ${i.roles.map(r => r.toString()).join(' ') || 'yok'}`)] }); }
      if (id === 'app:rol') { const st = STATE.get(sKey(i) + ':app'); if (st) st.rol = i.roles.first() ? i.roles.first().id : null; return refresh(i, { embeds: [E().setDescription(`> Rol: ${i.roles.first() || 'yok'}`)] }); }
      if (id === 'ann:rol') { const st = STATE.get(sKey(i) + ':ann'); if (st) st.rol = i.roles.first() ? i.roles.first().id : null; return annPreview(i); }
    }
    if (i.isStringSelectMenu()) {
      const id = i.customId;
      if (id === 'tk:secim') return createTicket(i, i.values[0]);
      if (id === 'help:cat') return i.update({ embeds: [helpEmbed(i.values[0])], components: [i.message.components[0]] });
      if (id === 'ann:mention') {
        const st = STATE.get(sKey(i) + ':ann'); if (!st) return;
        st.mention = i.values[0];
        if (st.mention === 'rol') {
          const rows = i.message.components.slice();
          if (!rows.some(r => r.components.some(c => c.customId === 'ann:rol'))) rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('ann:rol').setPlaceholder('Ping rolu').setMinValues(1).setMaxValues(1)));
          return i.update({ components: rows });
        }
        return annPreview(i);
      }
      if (id.startsWith('trade:petsel:')) {
        const tid = id.split(':')[2];
        const t = STATE.get('trade:' + tid);
        if (!t) return i.update({ embeds: [ERR('Trade bitti.')], components: [] });
        if (i.user.id !== t.from && i.user.id !== t.to) return i.update({ embeds: [ERR('Senin degil.')], components: [] });
        const side = i.user.id === t.from ? 'from' : 'to';
        const off = side === 'from' ? t.fromOffer : t.toOffer;
        const u = uconf(i.user.id);
        const pet = u.pets.find(p => p.id === i.values[0]);
        if (!pet || pet.equipped || off.pets.some(x => x.id === pet.id)) return i.update({ embeds: [ERR('Pet uygun degil.')], components: [] });
        off.pets.push({ id: pet.id, name: pet.name, emoji: pet.emoji, rarity: pet.rarity });
        t.conf[side] = false; t.exp = now() + 300000;
        await i.update({ embeds: [OKC('Pet teklife eklendi.')], components: [] });
        return tradeUpdate(t);
      }
      if (id.startsWith('trade:itemsel:')) {
        const tid = id.split(':')[2];
        const t = STATE.get('trade:' + tid);
        if (!t) return i.update({ embeds: [ERR('Trade bitti.')], components: [] });
        if (i.user.id !== t.from && i.user.id !== t.to) return i.update({ embeds: [ERR('Senin degil.')], components: [] });
        const side = i.user.id === t.from ? 'from' : 'to';
        const off = side === 'from' ? t.fromOffer : t.toOffer;
        const u = uconf(i.user.id);
        const idx = parseInt(i.values[0]);
        const it = u.inv[idx];
        if (!it) return i.update({ embeds: [ERR('Esya yok.')], components: [] });
        off.items.push({ idx, id: it.id, until: it.until || null });
        t.conf[side] = false; t.exp = now() + 300000;
        await i.update({ embeds: [OKC('Esya teklife eklendi.')], components: [] });
        return tradeUpdate(t);
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
  if (!sebep && g.guard.reklam && REKLAM_RX.test(m.content)) sebep = 'Reklam filtresi';
  if (!sebep) return;
  await m.delete().catch(() => {});
  const w = await m.channel.send({ embeds: [E(0xED4245).setDescription(`> **MESAJ SILINDI** — ${sebep}`)] });
  setTimeout(() => w.delete().catch(() => {}), 6000);
  g.strikes[m.author.id] = (g.strikes[m.author.id] || 0) + 1;
  await modlog(m.guild, E(0xED4245).setDescription(`> **GUARD**\n**Uye:** ${m.author.tag}\n**Sebep:** ${sebep}`));
  if (g.strikes[m.author.id] >= 3) {
    g.strikes[m.author.id] = 0;
    await m.member.timeout(600000, 'Guard').catch(() => {});
  }
});

/* ---------- ZAMANLAYICI ---------- */
setInterval(async () => {
  for (const [id, g] of Object.entries(DB.giveaways)) {
    if (g.ended) continue;
    const guild = client.guilds.cache.get(g.gid); if (!guild) continue;
    const ch = guild.channels.cache.get(g.cid);
    const left = g.end - now();
    const ping = g.ping === 'everyone' ? '@everyone' : g.ping === 'here' ? '@here' : g.ping === 'rol' && g.pingRole ? `<@&${g.pingRole}>` : '';
    if (!g.rem6 && left <= 21600000 && left > 0) { g.rem6 = true; if (ch) await ch.send({ content: `${ping} **Cekilis bitiyor!** Odul: **${g.prize}**` }).catch(() => {}); }
    if (!g.rem1 && left <= 3600000 && left > 0) { g.rem1 = true; if (ch) await ch.send({ content: `${ping} **SON 1 SAAT!** Odul: **${g.prize}**` }).catch(() => {}); }
    if (left <= 0) { await endGiveaway(g, false); continue; }
    if (ch) { try { const msg = await ch.messages.fetch(g.mid); await msg.edit({ embeds: [gwEmbed(g)], components: [gwRow(g)] }); } catch (e) {} }
  }
  saveDB();
}, 30000);
setInterval(() => { client.guilds.cache.forEach(g => updateUC(g)); }, 600000);

/* ===================== BASLAT ===================== */
process.on('unhandledRejection', (e) => console.error('UR:', e));
process.on('uncaughtException', (e) => console.error('UNCAUGHT:', e));
client.on('debug', (m) => console.log('[WS]', m));
client.on('error', (e) => console.error('[CLIENT ERROR]', e));
require('http').createServer((q, s) => { s.writeHead(200); s.end('Studioblox online'); }).listen(process.env.PORT || 8080);
setTimeout(() => { if (!client.isReady()) { console.error('[STUDIOBLOX] 60sn READY yok -> restart'); process.exit(1); } }, 60000);
initDB()
  .then(() => client.login(CONFIG.token.trim()))
  .then(() => console.log('[STUDIOBLOX] login cozuldu'))
  .catch(e => { console.error('LOGIN/DB HATA:', e); process.exit(1); });
