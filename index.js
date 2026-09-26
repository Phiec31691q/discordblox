require('net').setDefaultAutoSelectFamily(false);
/* ============================================================
   STUDIOBLOX v1.1.0 - PROFESYONEL DISCORD BOTU (TEK DOSYA)
   v1.1: modal sistemi kaldirildi (showModal hatasi cozumu),
   dm-at kullanici adi destegi, ticket/duyuru markdown duzeltmeleri.
   ============================================================ */
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  ChannelType, PermissionFlagsBits,
  Partials, AttachmentBuilder, SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');

/* ========================= CONFIG (ENVIRONMENT) ========================= */
const CONFIG = {
  token: process.env.TOKEN || "",
  ownerId: process.env.OWNER_ID || "",
  mequeenBanner: process.env.MEQUEEN_BANNER || "",
  version: "1.1.0"
};
if (!CONFIG.token) { console.error('[HATA] Render Environment icinde TOKEN yok!'); process.exit(1); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

/* ========================= VERİTABANI ========================= */
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
  if (!DB.users[uid]) DB.users[uid] = { balance: 0, bank: 0, inv: [], badges: [], cd: { daily: 0, work: 0, ara: 0 } };
  return DB.users[uid];
}

/* ========================= YARDIMCILAR ========================= */
const E = (c = 0x5865F2) => new EmbedBuilder().setColor(c).setTimestamp().setFooter({ text: `Studioblox • v${CONFIG.version}` });
const ERR = (t) => E(0xED4245).setDescription(`> **Hata**\n${t}`);
const OKC = (t) => E(0x57F287).setDescription(`> **Başarılı** 👌\n${t}`);
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
  if (g) out.push(g + ' gün');
  if (s) out.push(s + ' saat');
  if (d) out.push(d + ' dakika');
  return out.join(', ') || 'birkaç saniye';
}
async function dmUser(user, payload) { try { await user.send(payload); return true; } catch (e) { return false; } }
async function modlog(guild, embed) {
  const c = gconf(guild.id).modlog; if (!c) return;
  const ch = guild.channels.cache.get(c);
  if (ch) try { await ch.send({ embeds: [embed] }); } catch (e) {}
}
function adminCheck(i) { return isOwner(i.user) || (i.member && i.member.permissions.has(PermissionFlagsBits.Administrator)); }
function modCheck(i) { return isOwner(i.user) || (i.member && (i.member.permissions.has(PermissionFlagsBits.ModerateMembers) || i.member.permissions.has(PermissionFlagsBits.Administrator))); }

/* Panel yenileme yardimcisi (update/editReply fark etmez) */
async function refresh(i, payload) {
  try {
    if (i.deferred || i.replied) return await i.editReply(payload);
    return await i.update(payload);
  } catch (e) {
    try { return await i.followUp(payload); } catch (e2) {}
  }
}
/* Kanaldan tek mesajlik yazi toplar (modal yerine) */
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

/* ========================= KÜFÜR LİSTESİ (TR) ========================= */
const KUFUR = ['amk', 'aq', 'amq', 'orospu', 'piç', 'pic', 'sik', 'sikim', 'sikerim', 'yarrak', 'göt', 'gavat', 'pezevenk', 'kahpe', 'yavşak', 'amcık', 'amına', 'amina', 'oc', 'godoş', 'kerhane', 'sürtük'];
const KUFUR_RX = new RegExp(`\\b(${KUFUR.join('|')})\\b`, 'i');
const REKLAM_RX = /(discord\.gg|discord\.me|discord\.io|discordapp\.com\/invite|discord\.com\/invite)/i;

/* ========================= MEQUEEN HAZIR İÇERİK (MARKDOWN DÜZELTİLMİŞ) ========================= */
const MEQUEEN_TEXT = `**Sunucu Destek**

> Aşağıdaki ticket kurallarını okuduktan sonra ticket kategorisinden kategori seçerek ticket açabilirsiniz. Kuralları okudunuz sayılacaktır.

- Yanlış sebep ile ticket açmak yasaktır.
- Açtıktan sonra maksimum tag sınırı **2**'dir.
- Troll veya test amaçlı ticket açmak yasaktır.

**Kategoriler:** \`Bug Bildir\` • \`Şikayet\` • \`Yetkili Alım\` • \`Diğer\``;
const MEQUEEN_CATS = ['Bug Bildir', 'Şikayet', 'Yetkili Alım', 'Diğer'];

/* ========================= EKONOMİ ========================= */
const SHOP = [
  { id: 'boost2x', name: '2x Kazanç Boostu (1 saat)', price: 1000, desc: '1 saat boyunca daily/çalış/ara kazançları x2.' },
  { id: 'sans', name: 'Şans Tılsımı', price: 750, desc: 'Bir sonraki /robux ara kazancını garantili 150-300 R$ yapar (tek kullanım).' },
  { id: 'vip', name: 'VIP Rozet', price: 5000, desc: 'Bakiye embedinde kalıcı 💎 VIP rozeti.' }
];
const JOBS = ['Game Developer', 'Builder', 'Scripter', 'UI Tasarımcı', 'Animatör', 'Moderatör', 'Youtuber', 'Pizza Kuryesi'];
function hasBoost(u, id) {
  const it = uconf(u.id).inv.find(x => x.id === id);
  if (!it) return false;
  if (it.until && it.until < now()) { uconf(u.id).inv = uconf(u.id).inv.filter(x => x !== it); return false; }
  return true;
}
function boostMul(u) { return hasBoost(u, 'boost2x') ? 2 : 1; }

/* ========================= KOMUTLAR ========================= */
const CMDS = [];

CMDS.push({
  data: new SlashCommandBuilder().setName('ticket-kur').setDescription('🛠️ Kategori seçmeli gelişmiş ticket sistemi kurar').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Bu komutu kullanmak için **Yönetici** olmalısın.')], ephemeral: true });
    STATE.set(sKey(i) + ':tk', { exp: now() + 900000 });
    await i.reply({
      embeds: [E().setTitle('🛠️ Ticket Sistemi Kurulumu').setDescription('**Kurulum adımları:**\n`1.` Kurulum tipini seç (Kategorili / Kategorisiz)\n`2.` Panel kanalı + etiketlenecek rolleri seç\n`3.` **Devam** deyince istenen bilgileri kanala yaz\n`4.` Panel otomatik oluşturulsun')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk:mode:kategorili').setLabel('Kategorili Kur').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('tk:mode:kategorisiz').setLabel('Kategorisiz Kur').setStyle(ButtonStyle.Secondary))],
      ephemeral: true
    });
  }
});

CMDS.push({
  data: new SlashCommandBuilder().setName('ticket-kur-mequeen').setDescription('🛠️ Mequeen Studio hazır ticket paneli kurar').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Bu komutu kullanmak için **Yönetici** olmalısın.')], ephemeral: true });
    STATE.set(sKey(i) + ':mq', { exp: now() + 900000 });
    await i.reply({
      embeds: [E().setTitle('🛠️ Mequeen Studio Ticket Kurulumu').setDescription('> Hazır şablon: **Mequeen Studio Destek & Support**\n\n`1.` Panelin atılacağı kanalı seç\n`2.` Ticket açılınca etiketlenecek rolleri seç (isteğe bağlı)\n`3.` **Paneli Kur** butonuna bas\n\nKategoriler: `Bug Bildir` `Şikayet` `Yetkili Alım` `Diğer`')],
      components: [
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('mq:kanal').setPlaceholder('Panel kanalı seç...').setChannelTypes([ChannelType.GuildText])),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('mq:rol').setPlaceholder('Etiketlenecek roller (isteğe bağlı)').setMinValues(0).setMaxValues(5)),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mq:kur').setLabel('Paneli Kur').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('tk:iptal').setLabel('İptal').setStyle(ButtonStyle.Danger))],
      ephemeral: true
    });
  }
});

CMDS.push({
  data: new SlashCommandBuilder().setName('ban').setDescription('🔒 Üyeyi yasaklar').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Yasaklanacak üye').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Ban sebebi'))
    .addIntegerOption(o => o.setName('mesaj_sil').setDescription('Son X saniye mesajlarını sil')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok: **Üyeleri Yasakla**.')], ephemeral: true });
    const m = i.options.getMember('uye');
    if (!m) return i.reply({ embeds: [ERR('Üye bulunamadı.')], ephemeral: true });
    if (m.id === i.user.id || (m.roles.highest.position >= i.member.roles.highest.position && !isOwner(i.user)))
      return i.reply({ embeds: [ERR('Bu üyeye işlem uygulayamazsın (rol hiyerarşisi).')], ephemeral: true });
    const sebep = i.options.getString('sebep') || 'Sebep belirtilmedi';
    const ds = i.options.getInteger('mesaj_sil') || 0;
    await dmUser(m.user, E(0xED4245).setDescription(`> **🔒 BAN**\n**Sunucu:** ${i.guild.name}\n**Sebep:** ${sebep}\n**Yetkili:** ${i.user.tag}`));
    await m.ban({ deleteMessageSeconds: ds, reason: `${sebep} | ${i.user.tag}` });
    await modlog(i.guild, E(0xED4245).setDescription(`> **🔒 BAN**\n**Üye:** ${m.user.tag} (${m.id})\n**Yetkili:** ${i.user.tag}\n**Sebep:** ${sebep}`));
    i.reply({ embeds: [OKC(`${m.user.tag} yasaklandı.\n-# Sebep: ${sebep}`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('unban').setDescription('🔒 Ban kaldırır').setDMPermission(false)
    .addStringOption(o => o.setName('id').setDescription('Kullanıcı ID').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const id = i.options.getString('id');
    try {
      const u = await i.guild.bans.fetch(id);
      await i.guild.bans.remove(id, i.user.tag);
      await modlog(i.guild, E(0x57F287).setDescription(`> **🔒 UNBAN**\n**Üye:** ${u.user.tag}\n**Yetkili:** ${i.user.tag}`));
      i.reply({ embeds: [OKC(`${u.user.tag} banı kaldırıldı.`)] });
    } catch (e) { i.reply({ embeds: [ERR('Bu ID ile banlı üye bulunamadı.')], ephemeral: true }); }
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('kick').setDescription('🔒 Üyeyi atar').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Atılacak üye').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok: **Üyeleri At**.')], ephemeral: true });
    const m = i.options.getMember('uye');
    if (!m || !m.kickable) return i.reply({ embeds: [ERR('Üye atılamaz (hiyerarşi).')], ephemeral: true });
    const sebep = i.options.getString('sebep') || 'Sebep belirtilmedi';
    await dmUser(m.user, E(0xED4245).setDescription(`> **🔒 KICK**\n**Sunucu:** ${i.guild.name}\n**Sebep:** ${sebep}`));
    await m.kick(`${sebep} | ${i.user.tag}`);
    await modlog(i.guild, E(0xED4245).setDescription(`> **🔒 KICK**\n**Üye:** ${m.user.tag}\n**Yetkili:** ${i.user.tag}\n**Sebep:** ${sebep}`));
    i.reply({ embeds: [OKC(`${m.user.tag} sunucudan atıldı.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('mute').setDescription('🔒 Üyeyi süreli susturur').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Üye').setRequired(true))
    .addStringOption(o => o.setName('sure').setDescription('Örn: 10m, 1h, 1d').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok: **Üyeleri Zaman Aşımına Uğrat**.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const ms = parseDur(i.options.getString('sure'));
    if (!m || !m.moderatable) return i.reply({ embeds: [ERR('Üyeye timeout atılamaz.')], ephemeral: true });
    if (!ms || ms > 2419200000) return i.reply({ embeds: [ERR('Geçersiz süre. Örnek: `10m`, `1h`, `1d` (max 28 gün).')], ephemeral: true });
    const sebep = i.options.getString('sebep') || 'Sebep belirtilmedi';
    await m.timeout(ms, `${sebep} | ${i.user.tag}`);
    await modlog(i.guild, E(0xFEE75C).setDescription(`> **🔒 MUTE**\n**Üye:** ${m.user.tag}\n**Süre:** ${fmtDur(ms)}\n**Sebep:** ${sebep}\n**Yetkili:** ${i.user.tag}`));
    i.reply({ embeds: [OKC(`${m.user.tag}, **${fmtDur(ms)}** boyunca susturuldu.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('unmute').setDescription('🔒 Susturmayı kaldırır').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Üye').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    if (!m) return i.reply({ embeds: [ERR('Üye bulunamadı.')], ephemeral: true });
    await m.timeout(null, i.user.tag);
    i.reply({ embeds: [OKC(`${m.user.tag} susturması kaldırıldı.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('clear').setDescription('🔒 Kanaldan mesaj siler').setDMPermission(false)
    .addIntegerOption(o => o.setName('miktar').setDescription('1-100 arası').setRequired(true).setMinValue(1).setMaxValue(100)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok: **Mesajları Yönet**.')], ephemeral: true });
    const n = i.options.getInteger('miktar');
    const msgs = await i.channel.messages.fetch({ limit: n });
    const sil = msgs.filter(m => (now() - m.createdTimestamp) < 1209600000);
    await i.channel.bulkDelete(sil, true);
    i.reply({ embeds: [OKC(`**${sil.size}** mesaj silindi.`)] }).then(r => setTimeout(() => r.delete().catch(() => {}), 5000));
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('warn').setDescription('🔒 Üyeyi uyarır').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Üye').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const g = gconf(i.guild.id);
    if (!g.warns[m.id]) g.warns[m.id] = [];
    g.warns[m.id].push({ by: i.user.id, reason: i.options.getString('sebep'), time: now() });
    await dmUser(m.user, E(0xFEE75C).setDescription(`> **UYARI**\n**Sunucu:** ${i.guild.name}\n**Sebep:** ${i.options.getString('sebep')}\n**Toplam uyarı:** ${g.warns[m.id].length}`));
    await modlog(i.guild, E(0xFEE75C).setDescription(`> **🔒 WARN**\n**Üye:** ${m.user.tag}\n**Sebep:** ${i.options.getString('sebep')}\n**Yetkili:** ${i.user.tag}`));
    i.reply({ embeds: [OKC(`${m.user.tag} uyarıldı. (Toplam: ${g.warns[m.id].length})`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('uyarilar').setDescription('🔒 Uyarı listesi').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Üye').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const list = gconf(i.guild.id).warns[m.id] || [];
    i.reply({ embeds: [E().setTitle('🔒 Uyarı Listesi').setDescription(list.length ? list.map((w, x) => `**${x + 1}.** ${w.reason}\n-# <t:${Math.floor(w.time / 1000)}:f> • <@${w.by}>`).join('\n\n') : '> Bu üyenin uyarısı yok.')], ephemeral: true });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('uyari-sil').setDescription('🔒 Uyarı siler').setDMPermission(false)
    .addUserOption(o => o.setName('uye').setDescription('Üye').setRequired(true))
    .addIntegerOption(o => o.setName('no').setDescription('Uyarı numarası').setRequired(true)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const m = i.options.getMember('uye');
    const g = gconf(i.guild.id);
    const list = g.warns[m.id] || [];
    const no = i.options.getInteger('no') - 1;
    if (!list[no]) return i.reply({ embeds: [ERR('Bu numarada uyarı yok.')], ephemeral: true });
    list.splice(no, 1);
    i.reply({ embeds: [OKC('Uyarı silindi.')] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('slowmode').setDescription('⚙️ Yavaş mod').setDMPermission(false)
    .addIntegerOption(o => o.setName('saniye').setDescription('0-21600').setRequired(true).setMinValue(0).setMaxValue(21600)),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok: **Kanalları Yönet**.')], ephemeral: true });
    await i.channel.setRateLimitPerUser(i.options.getInteger('saniye'));
    i.reply({ embeds: [OKC(`Yavaş mod: **${i.options.getInteger('saniye')}sn**`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('kilitle').setDescription('🔒 Kanalı kilitler').setDMPermission(false)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanal (boşsa mevcut)')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const ch = i.options.getChannel('kanal') || i.channel;
    await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false });
    await modlog(i.guild, E(0xED4245).setDescription(`> **🔒 KİLİT**\n**Kanal:** ${ch}\n**Yetkili:** ${i.user.tag}`));
    i.reply({ embeds: [OKC(`${ch} kanalı kilitlendi.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('kilit-ac').setDescription('🔒 Kanal kilidini açar').setDMPermission(false)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanal (boşsa mevcut)')),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const ch = i.options.getChannel('kanal') || i.channel;
    await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: true });
    i.reply({ embeds: [OKC(`${ch} kanalı açıldı.`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('otorol').setDescription('🏷️ Oto rol').setDMPermission(false)
    .addSubcommand(s => s.setName('kur').setDescription('Otorol kurar').addRoleOption(o => o.setName('rol').setDescription('Verilecek rol').setRequired(true)))
    .addSubcommand(s => s.setName('kapat').setDescription('Otorolü kapatır')),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yönetici olmalısın.')], ephemeral: true });
    const g = gconf(i.guild.id);
    if (i.options.getSubcommand() === 'kur') {
      g.autorole = i.options.getRole('rol').id;
      i.reply({ embeds: [OKC(`Otorol kuruldu: <@&${g.autorole}>\n> Yeni üyelere otomatik verilecek.`)] });
    } else { g.autorole = null; i.reply({ embeds: [OKC('Otorol kapatıldı.')] }); }
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('guard').setDescription('⚙️ Guard filtreleri').setDMPermission(false)
    .addSubcommand(s => s.setName('kufur').setDescription('Türkçe küfür filtresi')
      .addStringOption(o => o.setName('durum').setDescription('aç/kapat').setRequired(true).addChoices({ name: 'Aç', value: 'ac' }, { name: 'Kapat', value: 'kapat' })))
    .addSubcommand(s => s.setName('reklam').setDescription('Davet linki filtresi')
      .addStringOption(o => o.setName('durum').setDescription('aç/kapat').setRequired(true).addChoices({ name: 'Aç', value: 'ac' }, { name: 'Kapat', value: 'kapat' }))),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yönetici olmalısın.')], ephemeral: true });
    const g = gconf(i.guild.id);
    const sub = i.options.getSubcommand();
    const ac = i.options.getString('durum') === 'ac';
    if (sub === 'kufur') g.guard.kufur = ac; else g.guard.reklam = ac;
    i.reply({ embeds: [OKC(`**${sub === 'kufur' ? 'Küfür Filtresi' : 'Reklam Filtresi'}:** ${ac ? '**AÇIK** 🔒' : '**KAPALI**'}`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('log-kur').setDescription('⚙️ Modlog kanalı ayarlar').setDMPermission(false)
    .addChannelOption(o => o.setName('kanal').setDescription('Log kanalı').setRequired(true).addChannelTypes(ChannelType.GuildText)),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yönetici olmalısın.')], ephemeral: true });
    gconf(i.guild.id).modlog = i.options.getChannel('kanal').id;
    i.reply({ embeds: [OKC(`Modlog kanalı: ${i.options.getChannel('kanal')}`)] });
  }
});

/* ---------- DUYURULAR (modal YOK, kanala yazmalı) ---------- */
function duyuruCmd(name, desc, type) {
  CMDS.push({
    data: new SlashCommandBuilder().setName(name).setDescription(desc).setDMPermission(false),
    async execute(i) {
      if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok: **Mesajları Yönet**.')], ephemeral: true });
      await i.deferReply({ ephemeral: true });
      const baslik = await collectChannel(i, `> **1/5 BAŞLIK** — ${type === 'leak' ? 'Leak duyurusu' : 'Güncelleme duyurusu'} başlığını yaz:`);
      if (!baslik) return i.editReply({ embeds: [ERR('Süre doldu, duyuru iptal.')], components: [] });
      const icerik = await collectChannel(i, '> **2/5 İÇERİK** — Duyuru metnini yaz (markdown serbest):');
      if (!icerik) return i.editReply({ embeds: [ERR('Süre doldu, duyuru iptal.')], components: [] });
      const thumb = await collectChannel(i, '> **3/5 THUMBNAIL** — Küçük görsel URL yaz (yoksa `-`):');
      if (thumb === null) return i.editReply({ embeds: [ERR('Süre doldu, duyuru iptal.')], components: [] });
      const image = await collectChannel(i, '> **4/5 BÜYÜK GÖRSEL** — URL yaz (yoksa `-`):');
      if (image === null) return i.editReply({ embeds: [ERR('Süre doldu, duyuru iptal.')], components: [] });
      const renk = await collectChannel(i, '> **5/5 RENK** — Hex kod yaz (örn: `5865F2`, yoksa `-`):');
      if (renk === null) return i.editReply({ embeds: [ERR('Süre doldu, duyuru iptal.')], components: [] });
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
duyuruCmd('güncelleme-duyuru', '📢 Profesyonel güncelleme duyurusu', 'guncelleme');
duyuruCmd('leak-duyuru', '📢 Profesyonel leak duyurusu', 'leak');

function annEmbed(a, user) {
  const color = a.renk ? parseInt(String(a.renk).replace('#', ''), 16) || (a.type === 'leak' ? 0xED4245 : 0x57F287) : (a.type === 'leak' ? 0xED4245 : 0x57F287);
  const eb = E(color);
  if (a.type === 'leak') eb.setDescription(`**👀 LEAK / SIZINTI BÜLTENİ**\n> **${a.baslik}**\n> *Kaynak doğrulanmamıştır; paylaşım sorumluluğu kullanıcıya aittir.*\n\n${a.icerik}`);
  else eb.setDescription(`**✨ GÜNCELLEME DUYURUSU**\n> **${a.baslik}**\n\n${a.icerik}`);
  if (a.thumb) eb.setThumbnail(a.thumb);
  if (a.image) eb.setImage(a.image);
  eb.setFooter({ text: `Duyuruyu hazırlayan: ${user.tag} • Studioblox` });
  return eb;
}
async function annPreview(i) {
  const st = STATE.get(sKey(i) + ':ann');
  if (!st) return;
  const rows = [
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('ann:kanal').setPlaceholder('Hedef kanal (boşsa mevcut)').setChannelTypes([ChannelType.GuildText])),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ann:mention').setPlaceholder('Etiket seç...').addOptions({ label: 'Etiket Yok', value: 'yok' }, { label: '@everyone', value: 'everyone' }, { label: '@here', value: 'here' }, { label: 'Rol', value: 'rol' })),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ann:gonder').setLabel('Duyuruyu Gönder 📢').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ann:iptal').setLabel('İptal').setStyle(ButtonStyle.Danger))
  ];
  return refresh(i, { embeds: [annEmbed(st, i.user).setTitle('ÖNİZLEME')], components: rows });
}

/* ---------- ÇEKİLİŞ ---------- */
CMDS.push({
  data: new SlashCommandBuilder().setName('çekiliş').setDescription('🎉 Gelişmiş çekiliş sistemi').setDMPermission(false)
    .addSubcommand(s => s.setName('başlat').setDescription('Çekiliş başlatır')
      .addStringOption(o => o.setName('sure').setDescription('Örn: 3d, 6h, 30m').setRequired(true))
      .addStringOption(o => o.setName('odul').setDescription('Ödül adı').setRequired(true))
      .addIntegerOption(o => o.setName('kazanan').setDescription('Kazanan sayısı').setRequired(true).setMinValue(1).setMaxValue(20))
      .addStringOption(o => o.setName('tur').setDescription('Çekiliş türü').setRequired(true).addChoices({ name: 'Normal', value: 'normal' }, { name: 'Rol Şartlı', value: 'rol' }, { name: 'Emek Şartlı', value: 'emek' }))
      .addRoleOption(o => o.setName('rol').setDescription('Rol şartı'))
      .addChannelOption(o => o.setName('kanal').setDescription('Kanal (boşsa mevcut)').addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('ping').setDescription('Bitiş hatırlatma pingi').addChoices({ name: 'Yok', value: 'yok' }, { name: 'Everyone', value: 'everyone' }, { name: 'Here', value: 'here' }, { name: 'Rol', value: 'rol' }))
      .addRoleOption(o => o.setName('ping_rol').setDescription('Ping rolü'))
      .addStringOption(o => o.setName('aciklama').setDescription('Ek açıklama')))
    .addSubcommand(s => s.setName('bitir').setDescription('Erken bitirir').addStringOption(o => o.setName('mesaj_id').setDescription('Çekiliş mesaj ID').setRequired(true)))
    .addSubcommand(s => s.setName('yeniden').setDescription('Reroll').addStringOption(o => o.setName('mesaj_id').setDescription('Çekiliş mesaj ID').setRequired(true))),
  async execute(i) {
    if (!modCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok.')], ephemeral: true });
    const sub = i.options.getSubcommand();
    if (sub === 'başlat') {
      const ms = parseDur(i.options.getString('sure'));
      if (!ms || ms < 60000) return i.reply({ embeds: [ERR('Geçersiz süre. Örnek: `3d`, `6h`, `30m`')], ephemeral: true });
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
      i.reply({ embeds: [OKC(`Çekiliş başlatıldı: ${msg.url}\n> Bitiş: <t:${Math.floor(g.end / 1000)}:R>`)], ephemeral: true });
    }
    if (sub === 'bitir' || sub === 'yeniden') {
      const g = DB.giveaways[i.options.getString('mesaj_id')];
      if (!g || g.gid !== i.guild.id) return i.reply({ embeds: [ERR('Çekiliş bulunamadı.')], ephemeral: true });
      if (sub === 'bitir') { if (g.ended) return i.reply({ embeds: [ERR('Bu çekiliş zaten bitmiş.')], ephemeral: true }); await endGiveaway(g, false); i.reply({ embeds: [OKC('Çekiliş bitirildi.')], ephemeral: true }); }
      else { await endGiveaway(g, true); i.reply({ embeds: [OKC('Yeniden kazanan çekildi.')], ephemeral: true }); }
    }
  }
});
function gwRow(g) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw:join:${g.mid || 'new'}`).setLabel('🎉 Katıl').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('gw:info').setLabel('Katılımcılar').setStyle(ButtonStyle.Secondary));
}
function gwEmbed(g) {
  const eb = E(0xFEE75C).setTitle(`🎉 ÇEKİLİŞ: ${g.prize}`);
  const tur = g.type === 'rol' ? 'Rol Şartlı' : g.type === 'emek' ? 'Emek Şartlı' : 'Normal';
  let d = `**Ödül:** ${g.prize}\n**Kazanan:** ${g.winners} kişi\n**Tür:** ${tur}\n**Bitiş:** <t:${Math.floor(g.end / 1000)}:R> (<t:${Math.floor(g.end / 1000)}:f>)\n**Katılımcı:** ${g.parts.length} üye`;
  if (g.roleReq) d += `\n**Şart:** <@&${g.roleReq}> rolü`;
  if (g.desc) d += `\n\n> ${g.desc}`;
  d += `\n\n> 🎉 butonuna basarak katıl! Kazananlar <t:${Math.floor(g.end / 1000)}:F> açıklanır.`;
  eb.setDescription(d);
  if (g.ended) { eb.setColor(0x57F287); eb.setTitle(`🎉 ÇEKİLİŞ BİTTİ: ${g.prize}`); }
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
  eb.setDescription(`**Ödül:** ${g.prize}\n**Kazananlar:** ${wins.length ? wins.map(w => `<@${w}>`).join(', ') : 'Katılımcı yok'}\n**Toplam katılımcı:** ${g.parts.length}\n> Çekiliş sona erdi.`);
  try { const msg = await ch.messages.fetch(g.mid); await msg.edit({ embeds: [eb], components: [] }); } catch (e) {}
  if (wins.length) {
    await ch.send({ content: `${wins.map(w => `<@${w}>`).join(', ')} **🎉 Tebrikler! \`${g.prize}\` çekilişini kazandınız!**` });
    for (const w of wins) {
      const u = await client.users.fetch(w).catch(() => null);
      if (u) dmUser(u, E(0x57F287).setDescription(`> **🎉 ÇEKİLİŞ KAZANDIN**\n**Sunucu:** ${guild.name}\n**Ödül:** ${g.prize}\n> Ödülünü almak için sunucuda yetkililerle iletişime geç.`));
    }
  } else await ch.send({ content: '**🎉 Çekiliş sona erdi:** yeterli katılımcı yok, kazanan yok.' });
  saveDB();
}

/* ---------- BAŞVURU ---------- */
CMDS.push({
  data: new SlashCommandBuilder().setName('başvuru-sistemi').setDescription('📋 Gelişmiş başvuru sistemi kurar').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yönetici olmalısın.')], ephemeral: true });
    STATE.set(sKey(i) + ':app', { exp: now() + 900000, kanal: null, log: null, rol: null, metin: null, sorular: [] });
    await i.reply({
      embeds: [E().setTitle('📋 Başvuru Sistemi Kurulumu').setDescription('`1.` Panel & log kanalını, kabul rolünü seç\n`2.` **Panel Metni** ile embed yazısını ayarla\n`3.` **Soru Ekle** ile soruları ekle (max 15)\n`4.` **Sistemi Kur** ile bitir')],
      components: [
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:kanal').setPlaceholder('Başvuru panel kanalı').setChannelTypes([ChannelType.GuildText])),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:log').setPlaceholder('Başvuru LOG kanalı').setChannelTypes([ChannelType.GuildText])),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('app:rol').setPlaceholder('Kabul rolü (opsiyonel)').setMinValues(0).setMaxValues(1)),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('app:metin').setLabel('Panel Metni').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('app:addsoru').setLabel('Soru Ekle').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('app:kur').setLabel('Sistemi Kur').setStyle(ButtonStyle.Success))],
      ephemeral: true
    });
  }
});

/* ---------- DM AT ---------- */
CMDS.push({
  data: new SlashCommandBuilder().setName('dm-at').setDescription('📢 DM üzerinden mesaj gönderir').setDMPermission(false),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yönetici olmalısın.')], ephemeral: true });
    STATE.set(sKey(i) + ':dm', { exp: now() + 600000, target: null, member: null });
    await i.reply({
      embeds: [E().setTitle('📢 DM Gönderim Sistemi').setDescription('> Kime gönderileceğini seç:\n`everyone` → tüm üyeler\n`here` → aktif üyeler\n`uye` → ID / mention / **Discord kullanıcı adı**')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dm:target:everyone').setLabel('Everyone').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dm:target:here').setLabel('Here (Online)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dm:target:uye').setLabel('Belirli Üye').setStyle(ButtonStyle.Secondary))],
      ephemeral: true
    });
  }
});

/* ---------- YARDIM ---------- */
const CATS = {
  moderasyon: [['/ban', 'Üye yasaklar'], ['/unban', 'Ban kaldırır'], ['/kick', 'Üye atar'], ['/mute', 'Süreli susturur'], ['/unmute', 'Susturma kaldırır'], ['/clear', 'Mesaj siler'], ['/warn', 'Uyarır'], ['/uyarilar', 'Uyarı listesi'], ['/uyari-sil', 'Uyarı siler'], ['/slowmode', 'Yavaş mod'], ['/kilitle', 'Kanal kilitler'], ['/kilit-ac', 'Kilit açar'], ['/otorol', 'Oto rol'], ['/guard', 'Küfür/reklam filtresi'], ['/log-kur', 'Modlog kanalı']],
  ticket: [['/ticket-kur', 'Kategorili/kategorisiz ticket paneli'], ['/ticket-kur-mequeen', 'Mequeen hazır panel'], ['Panel menüsü', 'Kategori seçerek ticket açma'], ['Ticket butonları', 'Kapat + otomatik transcript']],
  duyuru: [['/güncelleme-duyuru', 'Markdown destekli duyuru'], ['/leak-duyuru', 'Sızıntı bülteni'], ['Önizleme', 'Kanal/mention seçimli önizleme']],
  cekilis: [['/çekiliş başlat', 'Süre, ödül, tür, rol şartı, ping'], ['/çekiliş bitir', 'Erken bitir'], ['/çekiliş yeniden', 'Reroll'], ['Otomatik', '6 saat & 1 saat kala ping']],
  basvuru: [['/başvuru-sistemi', 'Panel + log + sorular + kabul rolü'], ['Log butonları', 'Gör / Kabul / Reddet / Beklemeye Al'], ['DM bildirim', 'Ret sebebi DM ile gider'], ['Form', 'DM üzerinden doldurulur']],
  dm: [['/dm-at', 'Everyone / Here / Tek üye (ID veya kullanıcı adı)']],
  ekonomi: [['/robux bakiye', 'Cüzdan + banka'], ['/robux cash', 'Transfer'], ['/robux günlük', 'Günlük R$'], ['/robux çalış', 'İş kazancı'], ['/robux ara', 'Rastgele R$'], ['/robux yazıtura', 'Coinflip'], ['/robux bahis', 'Zar x2/x10'], ['/robux duel', 'Üye düellosu'], ['/robux yatır / çek', 'Banka'], ['/robux market', 'Mağaza'], ['/robux envanter', 'Eşyalar'], ['/robux liderler', 'Top 10'], ['/robux bilgi', 'Rehber']],
  genel: [['/yardım', 'Bu menü (DM)'], ['/ping', 'Gecikme'], ['/avatar', 'Profil fotoğrafı'], ['/sunucu-bilgi', 'Sunucu istatistiği'], ['/üye-bilgi', 'Üye kartı'], ['/user-count', 'Kilitli sayaç kanalları']]
};
function helpEmbed(cat) {
  if (!cat) return E().setTitle('👋 Studioblox Yardım Merkezi').setDescription(`> Aşağıdaki menüden kategori seç.\n\n**Kategoriler:**\n\`moderasyon\` \`ticket\` \`duyuru\` \`cekilis\` \`basvuru\` \`dm\` \`ekonomi\` \`genel\`\n\n-# Bu mesaj DM üzerinden gönderildi.`);
  return E().setTitle(`👋 Yardım: ${cat.toUpperCase()}`).setDescription(CATS[cat].map(l => `**${l[0]}**\n> ${l[1]}`).join('\n\n'));
}
CMDS.push({
  data: new SlashCommandBuilder().setName('yardım').setDescription('👋 Yardım menüsünü DM gönderir'),
  async execute(i) {
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help:cat').setPlaceholder('Kategori seç...')
      .addOptions(Object.keys(CATS).map(k => ({ label: k.toUpperCase(), value: k, description: `${CATS[k].length} komut/özellik` }))));
    const ok = await dmUser(i.user, { embeds: [helpEmbed(null)], components: [row] });
    if (ok) i.reply({ embeds: [E().setDescription('> **Yardım menüsü DM üzerinden bildirildi, kontrol et.** 👌')], ephemeral: true });
    else i.reply({ embeds: [ERR('DM kutun kapalı. Sunucu ayarlarından DM izinlerini aç.')], ephemeral: true });
  }
});

/* ---------- USER COUNT ---------- */
CMDS.push({
  data: new SlashCommandBuilder().setName('user-count').setDescription('📊 Kilitli sayaç ses kanalları').setDMPermission(false)
    .addSubcommand(s => s.setName('kur').setDescription('Kur').addStringOption(o => o.setName('dil').setDescription('Dil').setRequired(true).addChoices({ name: 'English', value: 'en' }, { name: 'Türkçe', value: 'tr' })))
    .addSubcommand(s => s.setName('kapat').setDescription('Kapat')),
  async execute(i) {
    if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yönetici olmalısın.')], ephemeral: true });
    const g = gconf(i.guild.id);
    if (i.options.getSubcommand() === 'kapat') {
      if (g.usercount.categoryId) { const c = i.guild.channels.cache.get(g.usercount.categoryId); if (c) await c.delete().catch(() => {}); }
      g.usercount = { enabled: false, lang: 'en', categoryId: null, ch1: null, ch2: null };
      return i.reply({ embeds: [OKC('Sayaç kanalları silindi.')], ephemeral: true });
    }
    const lang = i.options.getString('dil');
    const cat = await i.guild.channels.create({
      name: lang === 'tr' ? '📊 İSTATİSTİK' : '📊 STATISTICS', type: ChannelType.GuildCategory,
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
    const c1 = await mk(lang === 'tr' ? 'Üye Sayısı: 0' : 'Member Count: 0');
    const c2 = await mk(lang === 'tr' ? 'Bot Sayısı: 0' : 'Bot Count: 0');
    g.usercount = { enabled: true, lang, categoryId: cat.id, ch1: c1.id, ch2: c2.id };
    await updateUC(i.guild);
    i.reply({ embeds: [OKC('Sayaç kanalları en üste kuruldu ve herkese **kilitli** 🔒 (yönetici hariç).')], ephemeral: true });
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
  const n1 = g.usercount.lang === 'tr' ? `Üye Sayısı: ${humans}` : `Member Count: ${humans}`;
  const n2 = g.usercount.lang === 'tr' ? `Bot Sayısı: ${bots}` : `Bot Count: ${bots}`;
  if (c1.name !== n1) await c1.setName(n1).catch(() => {});
  if (c2.name !== n2) await c2.setName(n2).catch(() => {});
}

/* ---------- ROBUX ---------- */
CMDS.push({
  data: new SlashCommandBuilder().setName('robux').setDescription('💸 Robux ekonomi sistemi')
    .addSubcommand(s => s.setName('bakiye').setDescription('Bakiye kartı').addUserOption(o => o.setName('uye').setDescription('Üye')))
    .addSubcommand(s => s.setName('cash').setDescription('R$ gönder').addUserOption(o => o.setName('uye').setDescription('Alıcı').setRequired(true)).addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('günlük').setDescription('Günlük ödül'))
    .addSubcommand(s => s.setName('çalış').setDescription('İşten kazan'))
    .addSubcommand(s => s.setName('ara').setDescription('R$ bul'))
    .addSubcommand(s => s.setName('yazıtura').setDescription('Coinflip').addStringOption(o => o.setName('tahmin').setDescription('Tahmin').setRequired(true).addChoices({ name: 'Yazı', value: 'yazi' }, { name: 'Tura', value: 'tura' })).addIntegerOption(o => o.setName('miktar').setDescription('Bahis').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('bahis').setDescription('Zar bahsi').addIntegerOption(o => o.setName('miktar').setDescription('Bahis').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('duel').setDescription('Düello').addUserOption(o => o.setName('uye').setDescription('Rakip').setRequired(true)).addIntegerOption(o => o.setName('miktar').setDescription('Bahis').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('yatır').setDescription('Bankaya yatır').addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('çek').setDescription('Bankadan çek').addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('market').setDescription('Mağaza'))
    .addSubcommand(s => s.setName('envanter').setDescription('Envanter'))
    .addSubcommand(s => s.setName('liderler').setDescription('Top 10'))
    .addSubcommand(s => s.setName('bilgi').setDescription('Rehber')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const u = uconf(i.user.id);
    if (sub === 'bakiye') {
      const t = i.options.getUser('uye') || i.user;
      const tu = uconf(t.id);
      return i.reply({ embeds: [E(0x57F287).setTitle('💸 BAKİYE KARTI').setThumbnail(t.displayAvatarURL())
        .setDescription(`**Üye:** ${t.tag}\n**Cüzdan:** ${balF(tu.balance)}\n**Banka:** ${balF(tu.bank)}\n**Envanter:** ${tu.inv.length} eşya${tu.badges.includes('vip') ? '\n**Rozet:** 💎 VIP' : ''}`)] });
    }
    if (sub === 'cash') {
      const t = i.options.getUser('uye'); const m = i.options.getInteger('miktar');
      if (t.bot) return i.reply({ embeds: [ERR('Botlara transfer yapılamaz.')], ephemeral: true });
      if (u.balance < m) return i.reply({ embeds: [ERR(`Yetersiz bakiye. Cüzdan: ${balF(u.balance)}`)], ephemeral: true });
      u.balance -= m; uconf(t.id).balance += m;
      dmUser(t, E(0x57F287).setDescription(`> **💸 TRANSFER**\n**Gönderen:** ${i.user.tag}\n**Miktar:** ${balF(m)}`));
      return i.reply({ embeds: [OKC(`${t.tag} üyesine ${balF(m)} gönderildi.`)] });
    }
    if (sub === 'günlük') {
      if (u.cd.daily > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.daily - now())}**`)], ephemeral: true });
      const kaz = 250 * boostMul(i.user);
      u.balance += kaz; u.cd.daily = now() + 86400000;
      return i.reply({ embeds: [OKC(`Günlük ödül: ${balF(kaz)}${boostMul(i.user) > 1 ? ' *(2x boost ✨)*' : ''}`)] });
    }
    if (sub === 'çalış') {
      if (u.cd.work > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.work - now())}**`)], ephemeral: true });
      const kaz = rnd(100, 400) * boostMul(i.user);
      u.balance += kaz; u.cd.work = now() + 3600000;
      return i.reply({ embeds: [OKC(`**${pick(JOBS)}** olarak çalıştın, ${balF(kaz)} kazandın.`)] });
    }
    if (sub === 'ara') {
      if (u.cd.ara > now()) return i.reply({ embeds: [ERR(`Kalan: **${fmtDur(u.cd.ara - now())}**`)], ephemeral: true });
      let kaz;
      const si = u.inv.findIndex(x => x.id === 'sans');
      if (si > -1) { kaz = rnd(150, 300); u.inv.splice(si, 1); } else kaz = rnd(15, 120) * boostMul(i.user);
      u.balance += kaz; u.cd.ara = now() + 1800000;
      const extra = Math.random() < 0.05 ? (u.inv.push({ id: 'vip_parca' }), '\n> 💎 Nadir parça buldun!') : '';
      return i.reply({ embeds: [OKC(`Aramada ${balF(kaz)} buldun.${extra}`)] });
    }
    if (sub === 'yazıtura') {
      const m = i.options.getInteger('miktar'); const t = i.options.getString('tahmin');
      if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true });
      const sonuc = Math.random() < 0.5 ? 'yazi' : 'tura';
      if (sonuc === t) { u.balance += m; return i.reply({ embeds: [OKC(`Yazı tura: **${sonuc}** → Kazandın ${balF(m)}!`)] }); }
      u.balance -= m;
      return i.reply({ embeds: [ERR(`Yazı tura: **${sonuc}** → Kaybettin ${balF(m)}.`)] });
    }
    if (sub === 'bahis') {
      const m = i.options.getInteger('miktar');
      if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true });
      const r = rnd(1, 100);
      if (r === 100) { u.balance += m * 9; return i.reply({ embeds: [OKC(`✨ JACKPOT! Zar **${r}** → x10 (${balF(m * 10)})`)] }); }
      if (r >= 50) { u.balance += m; return i.reply({ embeds: [OKC(`Zar **${r}** → x2 (${balF(m * 2)})`)] }); }
      u.balance -= m;
      return i.reply({ embeds: [ERR(`Zar **${r}** → Kaybettin ${balF(m)}.`)] });
    }
    if (sub === 'duel') {
      const t = i.options.getMember('uye'); const m = i.options.getInteger('miktar');
      if (!t || t.user.bot || t.id === i.user.id) return i.reply({ embeds: [ERR('Geçersiz rakip.')], ephemeral: true });
      if (u.balance < m || uconf(t.id).balance < m) return i.reply({ embeds: [ERR('Bakiye yetersiz (sen veya rakip).')], ephemeral: true });
      const id = rnd(100000, 999999);
      STATE.set('duel:' + id, { exp: now() + 60000, from: i.user.id, to: t.id, amt: m });
      return i.reply({
        embeds: [E(0xFEE75C).setTitle('💸 DÜELLO').setDescription(`**${i.user.tag}** vs **${t.user.tag}**\n**Bahis:** ${balF(m)}\n> ${t} kabul etmek için butona bas. (60 sn)`)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`duel:accept:${id}`).setLabel('Kabul Et').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`duel:decline:${id}`).setLabel('Reddet').setStyle(ButtonStyle.Danger))]
      });
    }
    if (sub === 'yatır') { const m = i.options.getInteger('miktar'); if (u.balance < m) return i.reply({ embeds: [ERR('Yetersiz bakiye.')], ephemeral: true }); u.balance -= m; u.bank += m; return i.reply({ embeds: [OKC(`Bankaya ${balF(m)} yatırıldı.`)] }); }
    if (sub === 'çek') { const m = i.options.getInteger('miktar'); if (u.bank < m) return i.reply({ embeds: [ERR('Bankada yeterli yok.')], ephemeral: true }); u.bank -= m; u.balance += m; return i.reply({ embeds: [OKC(`Bankadan ${balF(m)} çekildi.`)] }); }
    if (sub === 'market') {
      const rows = [];
      for (let x = 0; x < SHOP.length; x += 5) rows.push(new ActionRowBuilder().addComponents(SHOP.slice(x, x + 5).map(it =>
        new ButtonBuilder().setCustomId(`shop:buy:${it.id}`).setLabel(`🛒 ${it.name.split(' (')[0]} — R$ ${it.price}`).setStyle(ButtonStyle.Secondary))));
      return i.reply({ embeds: [E().setTitle('🛒 ROBUX MARKET').setDescription(SHOP.map(it => `**${it.name}** — ${balF(it.price)}\n> ${it.desc}`).join('\n\n'))], components: rows, ephemeral: true });
    }
    if (sub === 'envanter') return i.reply({ embeds: [E().setTitle('🛒 ENVANTER').setDescription(u.inv.length ? u.inv.map(x => { const it = SHOP.find(s => s.id === x.id); return `**${it ? it.name : x.id}**${x.until ? ` (kalan: ${fmtDur(x.until - now())})` : ''}`; }).join('\n') : '> Envanterin boş.')], ephemeral: true });
    if (sub === 'liderler') {
      const top = Object.entries(DB.users).sort((a, b) => (b[1].balance + b[1].bank) - (a[1].balance + a[1].bank)).slice(0, 10);
      return i.reply({ embeds: [E(0xFEE75C).setTitle('📊 ROBUX LİDERLERİ').setDescription(top.map((t, x) => `**${x + 1}.** <@${t[0]}> — ${balF(t[1].balance + t[1].bank)}`).join('\n') || '> Veri yok.')] });
    }
    if (sub === 'bilgi') return i.reply({ embeds: [E(0x57F287).setTitle('💸 ROBUX EKONOMİ REHBERİ').setDescription('> **Para birimi:** Robux (R$)\n\n**Kazanma:**\n`/robux günlük` → 24 saatte 250 R$\n`/robux çalış` → saatlik iş\n`/robux ara` → 30 dk\'da rastgele R$ (+%5 💎)\n\n**Oyunlar:**\n`/robux yazıtura` → coinflip\n`/robux bahis` → zar: 1-49 kaybet, 50-99 x2, 100 x10\n`/robux duel` → üye düellosu\n\n**Banka & Market:**\n`/robux yatır` `/robux çek`\n`/robux market` → boost, tılsım, VIP\n`/robux cash` → transfer\n\n-# Kazançlar globaldir.')] });
  }
});

/* ---------- GENEL ---------- */
CMDS.push({ data: new SlashCommandBuilder().setName('ping').setDescription('🌐 Gecikme'), async execute(i) { i.reply({ embeds: [E().setDescription(`> **🌐 PONG**\nGateway: **${client.ws.ping}ms**`)] }); } });
CMDS.push({
  data: new SlashCommandBuilder().setName('avatar').setDescription('🪪 Profil fotoğrafı').addUserOption(o => o.setName('uye').setDescription('Üye')),
  async execute(i) { const t = i.options.getUser('uye') || i.user; i.reply({ embeds: [E().setTitle(`🪪 ${t.tag}`).setImage(t.displayAvatarURL({ size: 512 }))] }); }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('sunucu-bilgi').setDescription('🌐 Sunucu bilgisi').setDMPermission(false),
  async execute(i) {
    const g = i.guild;
    const bots = g.members.cache.filter(m => m.user.bot).size;
    i.reply({ embeds: [E().setTitle('🌐 SUNUCU BİLGİSİ').setThumbnail(g.iconURL() || null).setDescription(`**Ad:** ${g.name}\n**Kuruluş:** <t:${Math.floor(g.createdTimestamp / 1000)}:f>\n**Üye:** ${g.memberCount - bots} (+${bots} bot)\n**Kanal:** ${g.channels.cache.size}\n**Rol:** ${g.roles.cache.size}\n**Sahip:** <@${g.ownerId}>`)] });
  }
});
CMDS.push({
  data: new SlashCommandBuilder().setName('üye-bilgi').setDescription('🪪 Üye kartı').addUserOption(o => o.setName('uye').setDescription('Üye')),
  async execute(i) {
    const t = i.options.getMember('uye') || i.member;
    i.reply({ embeds: [E().setTitle('🪪 ÜYE KARTI').setThumbnail(t.user.displayAvatarURL()).setDescription(`**Ad:** ${t.user.tag}\n**Katılım:** <t:${Math.floor(t.joinedTimestamp / 1000)}:f>\n**Hesap:** <t:${Math.floor(t.user.createdTimestamp / 1000)}:f>\n**Rol:** ${t.roles.cache.filter(r => r.id !== i.guild.id).size}`)] });
  }
});

/* ========================= TICKET ========================= */
async function createTicket(i, reasonLabel) {
  const conf = gconf(i.guild.id).ticket;
  if (!conf) return i.reply({ embeds: [ERR('Ticket sistemi kurulu değil.')], ephemeral: true });
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
  const eb = E().setTitle('🛠️ TICKET').setDescription(`${conf.text || 'Yetkililer en kısa sürede ilgilenecek.'}\n\n**Sebep:** ${reasonLabel}\n**Sahip:** ${i.user}`);
  if (conf.thumb && conf.thumb.startsWith('http')) eb.setThumbnail(conf.thumb);
  const content = [i.user.toString(), ...(conf.roles || []).map(r => `<@&${r}>`)].join(' ');
  await ch.send({ content, embeds: [eb], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk:kapat').setLabel('Ticketi Kapat').setStyle(ButtonStyle.Danger))] });
  await i.reply({ embeds: [OKC(`Ticket oluşturuldu: ${ch}`)], ephemeral: true });
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
    if (logCh) await logCh.send({ content: `**📎 Ticket Transcript** — <@${t.owner}> | Sebep: ${t.reason}`, files: [att] }).catch(() => {});
  }
  delete DB.tickets[i.channel.id];
  saveDB();
  await i.channel.delete('Ticket kapatıldı').catch(() => {});
}
async function finalizeTicket(i, st, cats) {
  const ch = i.guild.channels.cache.get(st.kanal);
  if (!ch) return refresh(i, { embeds: [ERR('Kanal bulunamadı.')], components: [] });
  gconf(i.guild.id).ticket = { mode: st.mode, channel: st.kanal, roles: st.roller || [], thumb: st.thumb, text: st.metin, cats, categoryId: null };
  const eb = E().setTitle('🛠️ HELP & SUPPORT').setDescription(st.metin);
  if (st.thumb && st.thumb.startsWith('http')) eb.setThumbnail(st.thumb);
  const comps = [];
  if (st.mode === 'kategorili' && cats.length) comps.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tk:secim').setPlaceholder('Ticket kategorisi seç...').addOptions(cats.map(c => ({ label: c, value: c })))));
  else comps.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tkpanel:create').setLabel('Ticket Oluştur').setStyle(ButtonStyle.Primary)));
  await ch.send({ embeds: [eb], components: comps });
  STATE.delete(sKey(i) + ':tk');
  return refresh(i, { embeds: [OKC(`Ticket paneli kuruldu: ${ch}`)], components: [] });
}

/* ========================= BAŞVURU YARDIMCILARI ========================= */
function appLogEmbed(a) {
  const renk = a.status === 'KABUL' ? 0x57F287 : a.status === 'RED' ? 0xED4245 : a.status === 'İNCELEMEDE' ? 0xFEE75C : 0x5865F2;
  return E(renk).setTitle(`📋 YENİ BAŞVURU #${a.id}`).setDescription(`**Başvuran:** <@${a.user}> (${a.user})\n**Tarih:** <t:${Math.floor(a.time / 1000)}:f>\n**Durum:** \`${a.status}\`\n**Soru sayısı:** ${a.qa.length}\n\n> İçeriği görmek için **Başvuruyu Gör** (yalnızca yönetici 🔑)`);
}
async function appLogUpdate(i, a) {
  try { await i.message.edit({ embeds: [appLogEmbed(a)], components: [i.message.components[0]] }); } catch (e) {}
  saveDB();
}
async function appSetupUpdate(i) {
  const st = STATE.get(sKey(i) + ':app');
  const rows = [
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:kanal').setPlaceholder('Panel kanalı').setChannelTypes([ChannelType.GuildText])),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('app:log').setPlaceholder('Log kanalı').setChannelTypes([ChannelType.GuildText])),
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('app:rol').setPlaceholder('Kabul rolü (opsiyonel)').setMinValues(0).setMaxValues(1)),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app:metin').setLabel('Panel Metni').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('app:addsoru').setLabel('Soru Ekle').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('app:kur').setLabel('Sistemi Kur').setStyle(ButtonStyle.Success))
  ];
  if (st.sorular.length) {
    const btns = st.sorular.map((s, x) => new ButtonBuilder().setCustomId(`app:sorusil:${x}`).setLabel(`✕ ${x + 1}. ${s.slice(0, 20)}`).setStyle(ButtonStyle.Danger));
    for (let x = 0; x < btns.length; x += 5) rows.push(new ActionRowBuilder().addComponents(btns.slice(x, x + 5)));
  }
  return refresh(i, {
    embeds: [E().setTitle('📋 Başvuru Kurulum').setDescription(`**Panel:** ${st.kanal ? `<#${st.kanal}>` : '❌'}\n**Log:** ${st.log ? `<#${st.log}>` : '❌'}\n**Kabul rolü:** ${st.rol ? `<@&${st.rol}>` : '—'}\n**Metin:** ${st.metin ? '✅' : '❌'}\n**Sorular (${st.sorular.length}):**\n${st.sorular.map((s, x) => `> \`{${x + 1}}\` ${s}`).join('\n') || '> yok'}`)],
    components: rows
  });
}

/* ========================= ETKİLEŞİM ========================= */
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
          embeds: [E().setTitle('🛠️ Ticket Kurulum — Adım 2').setDescription(`Tip: **${st.mode === 'kategorili' ? 'Kategorili' : 'Kategorisiz'}**\n> Panel kanalı ve rolleri seç, sonra **Devam**.`)],
          components: [
            new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('tk:kanal').setPlaceholder('Panel kanalı').setChannelTypes([ChannelType.GuildText])),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('tk:rol').setPlaceholder('Etiket roller (opsiyonel)').setMinValues(0).setMaxValues(5)),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('tk:devam').setLabel('Devam →').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('tk:iptal').setLabel('İptal').setStyle(ButtonStyle.Danger))]
        });
      }
      if (id === 'tk:devam') {
        const st = STATE.get(sKey(i) + ':tk');
        if (!st || !st.kanal) return refresh(i, { embeds: [ERR('Önce panel kanalı seç.')], components: [] });
        await i.deferUpdate().catch(() => {});
        const thumb = await collectChannel(i, '> **1/2 THUMBNAIL** — Panel üstü görsel URL yaz (yoksa `-`):');
        if (thumb === null) return refresh(i, { embeds: [ERR('Süre doldu, kurulum iptal.')], components: [] });
        st.thumb = thumb === '-' ? null : thumb;
        const metin = await collectChannel(i, '> **2/2 PANEL MESAJI** — Ticket panel açıklamasını yaz (markdown serbest):');
        if (!metin) return refresh(i, { embeds: [ERR('Süre doldu, kurulum iptal.')], components: [] });
        st.metin = metin;
        if (st.mode === 'kategorili') {
          const kats = await collectChannel(i, '> **KATEGORİLER** — Her satıra 1 kategori yaz (max 10):');
          if (!kats) return refresh(i, { embeds: [ERR('Süre doldu, kurulum iptal.')], components: [] });
          st.cats = kats.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 10);
        } else st.cats = [];
        STATE.set(sKey(i) + ':tk', st);
        return finalizeTicket(i, st, st.cats || []);
      }
      if (id === 'tkpanel:create') return createTicket(i, 'Genel Destek');
      if (id === 'tk:kapat') return i.reply({
        embeds: [E(0xED4245).setDescription('> **Ticket kapatılsın mı?**\nTranscript otomatik log kanalına gider. 📎')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('tk:kapat:onay').setLabel('Evet, Kapat').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('tk:kapat:vaz').setLabel('Vazgeç').setStyle(ButtonStyle.Secondary))],
        ephemeral: true
      });
      if (id === 'tk:kapat:vaz') return i.update({ embeds: [OKC('Kapatma iptal edildi.')], components: [] });
      if (id === 'tk:kapat:onay') { await i.update({ embeds: [OKC('Ticket kapatılıyor... 📎')], components: [] }); return closeTicket(i); }
      if (id === 'mq:kur') {
        const st = STATE.get(sKey(i) + ':mq');
        if (!st || !st.kanal) return refresh(i, { embeds: [ERR('Önce panel kanalı seç.')], components: [] });
        const ch = i.guild.channels.cache.get(st.kanal);
        gconf(i.guild.id).ticket = { mode: 'kategorili', channel: st.kanal, roles: st.roller || [], thumb: CONFIG.mequeenBanner, text: MEQUEEN_TEXT, cats: MEQUEEN_CATS, categoryId: null };
        const eb = E().setTitle('🛠️ MEQUEEN STUDIO — HELP & SUPPORT').setDescription(MEQUEEN_TEXT);
        if (CONFIG.mequeenBanner && CONFIG.mequeenBanner.startsWith('http')) eb.setThumbnail(CONFIG.mequeenBanner);
        await ch.send({ embeds: [eb], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tk:secim').setPlaceholder('Ticket kategorisi seç...').addOptions(MEQUEEN_CATS.map(c => ({ label: c, value: c }))))] });
        STATE.delete(sKey(i) + ':mq');
        return refresh(i, { embeds: [OKC(`Mequeen ticket paneli kuruldu: ${ch}`)], components: [] });
      }
      if (id === 'ann:gonder') {
        const st = STATE.get(sKey(i) + ':ann');
        if (!st) return i.update({ embeds: [ERR('Oturum zaman aşımı, komutu tekrar kullan.')], components: [] });
        const ch = i.guild.channels.cache.get(st.kanal || i.channel.id);
        if (!ch) return i.update({ embeds: [ERR('Kanal bulunamadı.')], components: [] });
        let content = '';
        if (st.mention === 'everyone') content = '@everyone';
        if (st.mention === 'here') content = '@here';
        if (st.mention === 'rol' && st.rol) content = `<@&${st.rol}>`;
        await ch.send({ content, embeds: [annEmbed(st, i.user)] });
        STATE.delete(sKey(i) + ':ann');
        return i.update({ embeds: [OKC(`Duyuru gönderildi: ${ch}`)], components: [] });
      }
      if (id === 'ann:iptal') { STATE.delete(sKey(i) + ':ann'); return i.update({ embeds: [ERR('Duyuru iptal edildi.')], components: [] }); }
      if (id.startsWith('gw:join:')) {
        const g = DB.giveaways[id.split(':')[2]];
        if (!g || g.ended) return i.reply({ embeds: [ERR('Çekiliş aktif değil.')], ephemeral: true });
        if (g.roleReq && !i.member.roles.cache.has(g.roleReq)) return i.reply({ embeds: [ERR(`Bu çekiliş için <@&${g.roleReq}> rolü gerekli.`)], ephemeral: true });
        const idx = g.parts.indexOf(i.user.id);
        if (idx > -1) { g.parts.splice(idx, 1); return i.reply({ embeds: [ERR('Katılımın geri çekildi.')], ephemeral: true }); }
        g.parts.push(i.user.id);
        return i.reply({ embeds: [OKC('Çekilişe katıldın! 🎉')], ephemeral: true });
      }
      if (id === 'gw:info') {
        const gg = DB.giveaways[i.message.id];
        if (!gg) return i.reply({ embeds: [ERR('Veri yok.')], ephemeral: true });
        return i.reply({ embeds: [E().setTitle('🎉 Katılımcılar').setDescription(gg.parts.length ? gg.parts.map(p => `<@${p}>`).join('\n') : '> Henüz katılımcı yok.')], ephemeral: true });
      }
      if (id === 'app:metin') {
        const st = STATE.get(sKey(i) + ':app');
        if (!st) return refresh(i, { embeds: [ERR('Oturum yok, komutu tekrar kullan.')], components: [] });
        await i.deferUpdate().catch(() => {});
        const baslik = await collectChannel(i, '> **PANEL BAŞLIĞI** — Başvuru paneli başlığını yaz:');
        if (!baslik) return refresh(i, { embeds: [ERR('Süre doldu.')], components: [] });
        const acik = await collectChannel(i, '> **PANEL AÇIKLAMASI** — Panel açıklamasını yaz (markdown serbest):');
        if (!acik) return refresh(i, { embeds: [ERR('Süre doldu.')], components: [] });
        st.metin = { baslik, acik };
        STATE.set(sKey(i) + ':app', st);
        return appSetupUpdate(i);
      }
      if (id === 'app:addsoru') {
        const st = STATE.get(sKey(i) + ':app');
        if (!st) return refresh(i, { embeds: [ERR('Oturum yok.')], components: [] });
        if (st.sorular.length >= 15) return i.reply({ embeds: [ERR('Max 15 soru.')], ephemeral: true });
        await i.deferUpdate().catch(() => {});
        const soru = await collectChannel(i, `> **SORU ${st.sorular.length + 1}** — Soru metnini yaz (örn: Discord adın nedir?):`);
        if (!soru) return refresh(i, { embeds: [ERR('Süre doldu.')], components: [] });
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
        if (!st || !st.kanal || !st.log || !st.metin || !st.sorular.length) return refresh(i, { embeds: [ERR('Eksik: panel kanalı, log kanalı, metin ve en az 1 soru zorunlu.')], components: [] });
        const ch = i.guild.channels.cache.get(st.kanal);
        gconf(i.guild.id).app = { panel: st.kanal, log: st.log, rol: st.rol || null, metin: st.metin, sorular: st.sorular };
        await ch.send({ embeds: [E().setTitle(`📋 ${st.metin.baslik}`).setDescription(st.metin.acik)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('app:apply').setLabel('Başvuru Yap').setStyle(ButtonStyle.Primary))] });
        STATE.delete(sKey(i) + ':app');
        return refresh(i, { embeds: [OKC(`Başvuru sistemi kuruldu: ${ch}`)], components: [] });
      }
      if (id === 'app:apply') {
        const conf = gconf(i.guild.id).app;
        if (!conf) return i.reply({ embeds: [ERR('Sistem kurulu değil.')], ephemeral: true });
        await i.reply({ embeds: [E().setDescription('> 📋 **Başvuru formu DM\'ine gönderildi.**\nSorulara DM\'den sırayla (her soruya ayrı mesaj) cevap yaz.')], ephemeral: true });
        const dm = await i.user.createDM();
        const answers = [];
        const pages = Math.ceil(conf.sorular.length / 5);
        for (let p = 0; p < pages; p++) {
          const qs = conf.sorular.slice(p * 5, p * 5 + 5);
          await dm.send({ embeds: [E().setTitle(`📋 Başvuru Formu (${p + 1}/${pages})`).setDescription(qs.map((q, x) => `**${p * 5 + x + 1}.** ${q}`).join('\n') + '\n\n> Her soruya **ayrı ayrı** mesaj olarak, sırayla cevap yaz.')] });
          const got = await dm.awaitMessages({ filter: m => m.author.id === i.user.id, max: qs.length, time: 300000 }).catch(() => null);
          if (!got || got.size < qs.length) { await dm.send({ embeds: [ERR('Süre doldu, başvuru iptal edildi.')] }).catch(() => {}); return i.editReply({ embeds: [ERR('Süre doldu, başvuru iptal.')], components: [] }); }
          got.forEach(m => answers.push(m.content));
        }
        const aid = rnd(1000, 9999);
        const qa = conf.sorular.map((q, x) => ({ q, a: answers[x] || '-' }));
        DB.apps[aid] = { id: aid, guild: i.guild.id, user: i.user.id, qa, status: 'YENİ', time: now() };
        const logCh = i.guild.channels.cache.get(conf.log);
        if (logCh) await logCh.send({
          embeds: [appLogEmbed(DB.apps[aid])],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app:view:${aid}`).setLabel('👀 Başvuruyu Gör').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`app:accept:${aid}`).setLabel('Kabul Et').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`app:reject:${aid}`).setLabel('Reddet').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`app:hold:${aid}`).setLabel('Beklemeye Al').setStyle(ButtonStyle.Secondary))]
        });
        saveDB();
        return i.editReply({ embeds: [OKC('Başvurun alındı! 📋 Sonuç DM ile bildirilecek.')], components: [] });
      }
      if (id.startsWith('app:view:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Başvuru içeriğini sadece **Yönetici** görür. 🔑')], ephemeral: true });
        const a = DB.apps[id.split(':')[2]];
        if (!a) return i.reply({ embeds: [ERR('Başvuru bulunamadı.')], ephemeral: true });
        return i.reply({ embeds: [E().setTitle(`📋 BAŞVURU #${a.id}`).setDescription(a.qa.map((q, x) => `**S${x + 1}:** ${q.q}\n> ${q.a}`).join('\n\n'))], ephemeral: true });
      }
      if (id.startsWith('app:accept:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok. 🔑')], ephemeral: true });
        const a = DB.apps[id.split(':')[2]];
        if (!a) return i.reply({ embeds: [ERR('Bulunamadı.')], ephemeral: true });
        a.status = 'KABUL';
        const conf = gconf(i.guild.id).app;
        const m = i.guild.members.cache.get(a.user);
        if (m && conf && conf.rol) await m.roles.add(conf.rol).catch(() => {});
        dmUser(await client.users.fetch(a.user), E(0x57F287).setDescription(`> **📋 BAŞVURU SONUCU**\n**${i.guild.name}** adlı sunucuda başvurunuz **kabul edildi**! 🎉\n> Yetkililer seninle iletişime geçecek.`));
        await appLogUpdate(i, a);
        return i.reply({ embeds: [OKC('Başvuru kabul edildi, kullanıcıya DM atıldı.')], ephemeral: true });
      }
      if (id.startsWith('app:reject:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok. 🔑')], ephemeral: true });
        await i.deferUpdate().catch(() => {});
        const sebep = await collectChannel(i, '> **REDDETME AÇIKLAMASI** — Kullanıcıya DM gidecek sebebi yaz:');
        if (!sebep) return refresh(i, { embeds: [ERR('Süre doldu.')], components: [] });
        const a = DB.apps[id.split(':')[2]];
        if (!a) return refresh(i, { embeds: [ERR('Bulunamadı.')], components: [] });
        a.status = 'RED';
        dmUser(await client.users.fetch(a.user), E(0xED4245).setDescription(`> **📋 BAŞVURU SONUCU**\n**${i.guild.name}** adlı sunucuda başvurunuz **reddedildi**.\n> Reddedilme sebebi: ${sebep}`));
        await appLogUpdate(i, a);
        return refresh(i, { embeds: [OKC('Başvuru reddedildi, kullanıcıya sebepli DM atıldı.')], components: [] });
      }
      if (id.startsWith('app:hold:')) {
        if (!adminCheck(i)) return i.reply({ embeds: [ERR('Yetkin yok. 🔑')], ephemeral: true });
        const a = DB.apps[id.split(':')[2]];
        if (!a) return i.reply({ embeds: [ERR('Bulunamadı.')], ephemeral: true });
        a.status = 'İNCELEMEDE';
        dmUser(await client.users.fetch(a.user), E(0xFEE75C).setDescription(`> **📋 BAŞVURU SONUCU**\n**${i.guild.name}** adlı sunucuda başvurunuz **incelemeye/beklemeye alındı**. ⚙️\n> Sonuç DM üzerinden bildirilecek.`));
        await appLogUpdate(i, a);
        return i.reply({ embeds: [OKC('Başvuru incelemeye alındı.')], ephemeral: true });
      }
      if (id.startsWith('dm:target:')) {
        const st = STATE.get(sKey(i) + ':dm') || { exp: now() + 600000 };
        st.target = id.split(':')[2];
        STATE.set(sKey(i) + ':dm', st);
        await i.deferUpdate().catch(() => {});
        if (st.target === 'uye') {
          const raw = await collectChannel(i, '> **ÜYE SEÇ** — Üye ID, mention veya **Discord kullanıcı adı** yaz:');
          if (!raw) return refresh(i, { embeds: [ERR('Süre doldu.')], components: [] });
          let member = null;
          const idm = (raw.match(/\d{17,20}/) || [null])[0];
          if (idm) member = await i.guild.members.fetch(idm).catch(() => null);
          if (!member) {
            const q = raw.replace(/^@/, '').trim().toLowerCase();
            member = i.guild.members.cache.find(m => m.user.username.toLowerCase() === q)
              || i.guild.members.cache.find(m => (m.displayName || '').toLowerCase() === q)
              || i.guild.members.cache.find(m => m.user.username.toLowerCase().includes(q));
          }
          if (!member) return refresh(i, { embeds: [ERR('Üye bulunamadı. ID, mention veya doğru kullanıcı adı dene.')], components: [] });
          st.member = member.id;
          STATE.set(sKey(i) + ':dm', st);
        }
        const metin = await collectChannel(i, '> **DM METNİ** — Gönderilecek mesajı yaz (markdown serbest):');
        if (!metin) return refresh(i, { embeds: [ERR('Süre doldu.')], components: [] });
        st.metin = metin;
        STATE.set(sKey(i) + ':dm', st);
        const hedef = st.target === 'everyone' ? 'Tüm üyeler' : st.target === 'here' ? 'Çevrimiçi üyeler' : `<@${st.member}>`;
        return i.followUp({
          embeds: [E().setTitle('📢 DM ÖNİZLEME').setDescription(`**Hedef:** ${hedef}\n\n> ${st.metin}`)],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dm:onay').setLabel('Gönder').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('dm:iptal').setLabel('İptal').setStyle(ButtonStyle.Danger))],
          ephemeral: true
        });
      }
      if (id === 'dm:onay') {
        const st = STATE.get(sKey(i) + ':dm');
        if (!st || !st.metin) return i.update({ embeds: [ERR('Veri eksik.')], components: [] });
        await i.update({ embeds: [E().setDescription('> ⚙️ Gönderim başladı...')], components: [] });
        let targets = [];
        if (st.target === 'everyone') targets = (await i.guild.members.fetch()).filter(m => !m.user.bot).map(m => m.user);
        if (st.target === 'here') targets = i.guild.members.cache.filter(m => !m.user.bot && m.presence && m.presence.status !== 'offline').map(m => m.user);
        if (st.target === 'uye' && st.member) targets = [await client.users.fetch(st.member).catch(() => null)].filter(Boolean);
        let okc = 0, fail = 0;
        for (const u of targets) { const sent = await dmUser(u, { content: st.metin }); sent ? okc++ : fail++; await new Promise(r => setTimeout(r, 350)); }
        STATE.delete(sKey(i) + ':dm');
        return i.editReply({ embeds: [E(0x57F287).setTitle('📊 DM RAPORU').setDescription(`**Başarılı:** ${okc}\n**Başarısız:** ${fail}\n> Gönderim tamamlandı.`)], components: [] });
      }
      if (id === 'dm:iptal') { STATE.delete(sKey(i) + ':dm'); return i.update({ embeds: [ERR('DM iptal.')], components: [] }); }
      if (id.startsWith('duel:accept:') || id.startsWith('duel:decline:')) {
        const d = STATE.get('duel:' + id.split(':')[2]);
        if (!d) return i.update({ embeds: [ERR('Düello zaman aşımı.')], components: [] });
        if (i.user.id !== d.to) return i.reply({ embeds: [ERR('Bu düello sana ait değil.')], ephemeral: true });
        STATE.delete('duel:' + id.split(':')[2]);
        if (id.startsWith('duel:decline:')) return i.update({ embeds: [ERR('Düello reddedildi.')], components: [] });
        const a = uconf(d.from), b = uconf(d.to);
        if (a.balance < d.amt || b.balance < d.amt) return i.update({ embeds: [ERR('Bakiye yetersiz.')], components: [] });
        const r1 = rnd(1, 100), r2 = rnd(1, 100);
        const win = r1 === r2 ? null : (r1 > r2 ? d.from : d.to);
        if (win === d.from) { a.balance += d.amt; b.balance -= d.amt; }
        else if (win === d.to) { b.balance += d.amt; a.balance -= d.amt; }
        return i.update({ embeds: [E(0xFEE75C).setTitle('💸 DÜELLO SONUCU').setDescription(`**<@${d.from}>:** ${r1}\n**<@${i.user.id}>:** ${r2}\n> ${win ? `Kazanan: <@${win}> (${balF(d.amt)})` : 'Berabere, bahis iade.'}`)], components: [] });
      }
      if (id.startsWith('shop:buy:')) {
        const it = SHOP.find(s => s.id === id.split(':')[2]);
        const u = uconf(i.user.id);
        if (!it) return i.reply({ embeds: [ERR('Ürün yok.')], ephemeral: true });
        if (u.balance < it.price) return i.reply({ embeds: [ERR(`Yetersiz bakiye: ${balF(u.balance)} / ${balF(it.price)}`)], ephemeral: true });
        u.balance -= it.price;
        u.inv.push({ id: it.id, until: it.id === 'boost2x' ? now() + 3600000 : null });
        if (it.id === 'vip' && !u.badges.includes('vip')) u.badges.push('vip');
        return i.reply({ embeds: [OKC(`Satın alındı: **${it.name}** 🛒`)], ephemeral: true });
      }
    }
    if (i.isChannelSelectMenu()) {
      const id = i.customId; const ch = i.channels.first();
      if (id === 'tk:kanal') { const st = STATE.get(sKey(i) + ':tk') || {}; st.kanal = ch.id; STATE.set(sKey(i) + ':tk', st); return refresh(i, { embeds: [E().setDescription(`> Panel kanalı: ${ch}\n> Rolleri seç (opsiyonel) ve **Devam**.`)] }); }
      if (id === 'mq:kanal') { const st = STATE.get(sKey(i) + ':mq') || {}; st.kanal = ch.id; STATE.set(sKey(i) + ':mq', st); return refresh(i, { embeds: [E().setDescription(`> Panel kanalı: ${ch}`)] }); }
      if (id === 'app:kanal') { const st = STATE.get(sKey(i) + ':app'); if (st) st.kanal = ch.id; return refresh(i, { embeds: [E().setDescription(`> Panel kanalı: ${ch}`)] }); }
      if (id === 'app:log') { const st = STATE.get(sKey(i) + ':app'); if (st) st.log = ch.id; return refresh(i, { embeds: [E().setDescription(`> Log kanalı: ${ch}`)] }); }
      if (id === 'ann:kanal') { const st = STATE.get(sKey(i) + ':ann'); if (st) st.kanal = ch.id; return annPreview(i); }
    }
    if (i.isRoleSelectMenu()) {
      const id = i.customId;
      if (id === 'tk:rol') { const st = STATE.get(sKey(i) + ':tk') || {}; st.roller = i.roles.map(r => r.id); STATE.set(sKey(i) + ':tk', st); return refresh(i, { embeds: [E().setDescription(`> Etiket roller: ${i.roles.map(r => r.toString()).join(' ') || 'yok'}`)] }); }
      if (id === 'mq:rol') { const st = STATE.get(sKey(i) + ':mq') || {}; st.roller = i.roles.map(r => r.id); STATE.set(sKey(i) + ':mq', st); return refresh(i, { embeds: [E().setDescription(`> Etiket roller: ${i.roles.map(r => r.toString()).join(' ') || 'yok'}`)] }); }
      if (id === 'app:rol') { const st = STATE.get(sKey(i) + ':app'); if (st) st.rol = i.roles.first() ? i.roles.first().id : null; return refresh(i, { embeds: [E().setDescription(`> Kabul rolü: ${i.roles.first() || 'yok'}`)] }); }
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
          if (!rows.some(r => r.components.some(c => c.customId === 'ann:rol'))) rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('ann:rol').setPlaceholder('Ping rolü').setMinValues(1).setMaxValues(1)));
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

/* ========================= OLAYLAR ========================= */
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
});
client.on('guildMemberRemove', (m) => updateUC(m.guild));
client.on('messageCreate', async (m) => {
  if (m.author.bot || !m.guild) return;
  const g = gconf(m.guild.id);
  if (!g.guard.kufur && !g.guard.reklam) return;
  if (m.member.permissions.has(PermissionFlagsBits.Administrator)) return;
  let sebep = null;
  if (g.guard.kufur && KUFUR_RX.test(m.content)) sebep = 'Küfür filtresi';
  if (!sebep && g.guard.reklam && REKLAM_RX.test(m.content)) sebep = 'Reklam/davet filtresi';
  if (!sebep) return;
  await m.delete().catch(() => {});
  const w = await m.channel.send({ embeds: [E(0xED4245).setDescription(`> **🔒 MESAJ SİLİNDİ**\n${m.author}, ${sebep} ihlali tespit edildi.\n-# Tekrarında otomatik ceza uygulanır.`)] });
  setTimeout(() => w.delete().catch(() => {}), 6000);
  g.strikes[m.author.id] = (g.strikes[m.author.id] || 0) + 1;
  await modlog(m.guild, E(0xED4245).setDescription(`> **⚙️ GUARD**\n**Üye:** ${m.author.tag}\n**Sebep:** ${sebep}\n**Uyarı sayısı:** ${g.strikes[m.author.id]}`));
  if (g.strikes[m.author.id] >= 3) {
    g.strikes[m.author.id] = 0;
    await m.member.timeout(600000, 'Guard: 3 ihlal').catch(() => {});
    await modlog(m.guild, E(0xED4245).setDescription(`> **⚙️ GUARD CEZA**\n${m.author} 3 ihlal nedeniyle **10 dakika** susturuldu.`));
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
      if (ch) await ch.send({ content: `${ping} **🎉 Çekiliş bitiyor acele edin!** Ödül: **${g.prize}** — <t:${Math.floor(g.end / 1000)}:R> kaldı.\n-# (bot tarafından otomatik)` }).catch(() => {});
    }
    if (!g.rem1 && left <= 3600000 && left > 0) {
      g.rem1 = true;
      if (ch) await ch.send({ content: `${ping} **🎉 SON 1 SAAT! Çekiliş bitiyor acele edin!** Ödül: **${g.prize}**\n-# (bot tarafından otomatik)` }).catch(() => {});
    }
    if (left <= 0) { await endGiveaway(g, false); continue; }
    if (ch) { try { const msg = await ch.messages.fetch(g.mid); await msg.edit({ embeds: [gwEmbed(g)], components: [gwRow(g)] }); } catch (e) {} }
  }
  saveDB();
}, 30000);
setInterval(() => { client.guilds.cache.forEach(g => updateUC(g)); }, 600000);

/* ========================= TEŞHİS + BAŞLATMA ========================= */
process.on('unhandledRejection', (e) => console.error('UR:', e));
process.on('uncaughtException', (e) => console.error('UNCAUGHT:', e));
client.on('debug', (m) => console.log('[WS]', m));
client.on('error', (e) => console.error('[CLIENT ERROR]', e));

require('http').createServer((q, s) => { s.writeHead(200); s.end('Studioblox online'); }).listen(process.env.PORT || 8080);

(async () => {
  const urls = ['https://api.github.com/zen', 'https://discord.com/api/v10/gateway'];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'DiscordBot (https://github.com/Phiec31691q, 1.0)', 'Accept': 'application/json' } });
      const t = await r.text();
      console.log(`[NET] ${url} -> ${r.status} | body=${t.slice(0, 80).replace(/\n/g, ' ')}`);
    } catch (e) { console.error('[NET] fetch hata:', url, e.message); }
  }
})();

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
