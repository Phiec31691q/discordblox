const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- 1. RENDER UPTIME SUNUCUSU ---
const app = express();
app.get('/', (req, res) => res.send('Studioblox Bot 7/24 Aktif!'));
app.listen(process.env.PORT || 3000, () => console.log('[WEB] Uptime sunucusu hazır.'));

// --- 2. BOT İSTEMCİSİ VE İZİNLER ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

// --- 3. KRİTİK HATA VE WEBSOCKET YAKALAYICILARI ---
client.on('error', err => console.error('❌ [CLIENT HATASI]:', err));
client.on('shardError', (err, id) => console.error(`❌ [WEBSOCKET / SHARD HATASI - Shard ${id}]:`, err));
process.on('unhandledRejection', (reason, p) => console.error('❌ [YAKALANMAYAN PROMISE HATASI]:', reason));

// --- 4. GEÇİCİ VERİTABANI VE SİSTEM HAFIZASI ---
const dbFilePath = path.join(__dirname, 'data.json');
let db = { warnings: {}, autorole: {}, usercount: {}, giveaways: {} };

if (fs.existsSync(dbFilePath)) {
    try {
        db = JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
    } catch (e) {
        console.error('Veritabanı okuma hatası:', e);
    }
}

function saveDB() {
    fs.writeFileSync(dbFilePath, JSON.stringify(db, null, 2));
}

// --- 5. TÜM SLASH KOMUTLARI ---
const commands = [
    new SlashCommandBuilder().setName('ban').setDescription('Kullanıcıyı sunucudan yasaklar').addUserOption(o => o.setName('hedef').setDescription('Kullanıcı').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')).toJSON(),
    new SlashCommandBuilder().setName('kick').setDescription('Kullanıcıyı sunucudan atar').addUserOption(o => o.setName('hedef').setDescription('Kullanıcı').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')).toJSON(),
    new SlashCommandBuilder().setName('clear').setDescription('Belirtilen miktarda mesajı siler').addIntegerOption(o => o.setName('sayi').setDescription('1-100 arası miktar').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('mute').setDescription('Kullanıcıyı süreli susturur').addUserOption(o => o.setName('hedef').setDescription('Kullanıcı').setRequired(true)).addIntegerOption(o => o.setName('sure').setDescription('Dakika cinsinden süre').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('unmute').setDescription('Kullanıcının susturmasını kaldırır').addUserOption(o => o.setName('hedef').setDescription('Kullanıcı').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('warn').setDescription('Kullanıcıya uyarı verir').addUserOption(o => o.setName('hedef').setDescription('Kullanıcı').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Uyarı sebebi').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('uyarilar').setDescription('Kullanıcının uyarılarını gösterir').addUserOption(o => o.setName('hedef').setDescription('Kullanıcı').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('lock').setDescription('Bulunduğunuz kanalı mesaja kapatır').toJSON(),
    new SlashCommandBuilder().setName('unlock').setDescription('Bulunduğunuz kanalı mesaja açar').toJSON(),
    new SlashCommandBuilder().setName('slowmode').setDescription('Kanalın yavaş modunu ayarlar').addIntegerOption(o => o.setName('saniye').setDescription('Saniye (0 = kapalı)').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('otorol').setDescription('Yeni gelenlere verilecek otomatik rolü ayarlar').addRoleOption(o => o.setName('rol').setDescription('Verilecek rol').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('ticket-kur').setDescription('Gelişmiş bilet destek sistemini kurar').addChannelOption(o => o.setName('kanal').setDescription('Kurulacak kanal').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('ticket-kur-mequeen').setDescription('Mequeen temalı özel destek sistemini kurar').addChannelOption(o => o.setName('kanal').setDescription('Kurulacak kanal').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('cekilis-baslat').setDescription('Yeni bir çekiliş başlatır').addStringOption(o => o.setName('odul').setDescription('Çekiliş Ödülü').setRequired(true)).addIntegerOption(o => o.setName('sure').setDescription('Süre (Dakika)').setRequired(true)).addIntegerOption(o => o.setName('kazanan_sayisi').setDescription('Kazanan Sayısı').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('robux').setDescription('Robux stok ve fiyat bilgisini gösterir').toJSON(),
    new SlashCommandBuilder().setName('robux-owo-bilgi').setDescription('OwO ile Robux takas kurallarını gösterir').toJSON(),
    new SlashCommandBuilder().setName('basvuru-sistemi').setDescription('Yetkili başvuru sistemini kanala kurar').addChannelOption(o => o.setName('kanal').setDescription('Kurulacak kanal').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('sayac-kur').setDescription('Giriş-çıkış sayaç sistemini ayarlar').addChannelOption(o => o.setName('kanal').setDescription('Sayaç kanalı').setRequired(true)).addIntegerOption(o => o.setName('hedef').setDescription('Hedef üye sayısı').setRequired(true)).toJSON(),
    new SlashCommandBuilder().setName('yardim').setDescription('Tüm bot komutlarını ve kategorilerini gösterir').toJSON()
];

// --- 6. READY EVENT ---
client.once('ready', async () => {
    console.log(`🟢 [STUDIOBLOX] ${client.user.tag} BARIŞÇIL VE AKTİF ŞEKİLDE ÇALIŞIYOR!`);

    const token = (process.env.TOKEN || '').trim();
    const clientId = (process.env.CLIENT_ID || client.user.id).trim();

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log('[BOT] Slash komutları yükleniyor...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );
        console.log('[BOT] TÜM Slash komutları yüklendi!');
    } catch (error) {
        console.error('[HATA] Slash komutları yüklenemedi:', error);
    }
});

// --- 7. OTOROL & SAYAÇ ---
client.on('guildMemberAdd', async (member) => {
    const guildId = member.guild.id;

    if (db.autorole[guildId]) {
        const role = member.guild.roles.cache.get(db.autorole[guildId]);
        if (role) member.roles.add(role).catch(() => {});
    }

    if (db.usercount[guildId]) {
        const { channelId, target } = db.usercount[guildId];
        const channel = member.guild.channels.cache.get(channelId);
        if (channel) {
            const currentCount = member.guild.memberCount;
            const remaining = target - currentCount;
            channel.send(`📥 ${member} katıldı! Sunucumuz **${currentCount}** kişiye ulaştı. **${target}** üye hedefimize son **${remaining}** kişi kaldı!`);
        }
    }
});

// --- 8. ETKİLEŞİM VE KOMUT DİNLEYİCİSİ ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, channel, member } = interaction;

        if (commandName === 'ban') {
            if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'Yetkiniz yetersiz!', ephemeral: true });
            const target = options.getUser('hedef');
            const reason = options.getString('sebep') || 'Sebep belirtilmedi';
            await guild.members.ban(target, { reason });
            return interaction.reply({ content: `✅ **${target.tag}** sunucudan yasaklandı. Sebep: ${reason}` });
        }

        if (commandName === 'kick') {
            if (!member.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: 'Yetkiniz yetersiz!', ephemeral: true });
            const target = options.getUser('hedef');
            const reason = options.getString('sebep') || 'Sebep belirtilmedi';
            await guild.members.kick(target, reason);
            return interaction.reply({ content: `✅ **${target.tag}** sunucudan atıldı. Sebep: ${reason}` });
        }

        if (commandName === 'clear') {
            if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: 'Yetkiniz yetersiz!', ephemeral: true });
            const amount = options.getInteger('sayi');
            if (amount < 1 || amount > 100) return interaction.reply({ content: 'Lütfen 1-100 arası bir sayı girin.', ephemeral: true });
            await channel.bulkDelete(amount, true);
            return interaction.reply({ content: `🧹 **${amount}** adet mesaj temizlendi.`, ephemeral: true });
        }

        if (commandName === 'mute') {
            if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: 'Yetkiniz yetersiz!', ephemeral: true });
            const target = options.getUser('hedef');
            const duration = options.getInteger('sure');
            const targetMember = await guild.members.fetch(target.id);
            await targetMember.timeout(duration * 60 * 1000, 'Susturuldu');
            return interaction.reply({ content: `🤐 **${target.tag}**, ${duration} dakika boyunca susturuldu.` });
        }

        if (commandName === 'unmute') {
            if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: 'Yetkiniz yetersiz!', ephemeral: true });
            const target = options.getUser('hedef');
            const targetMember = await guild.members.fetch(target.id);
            await targetMember.timeout(null);
            return interaction.reply({ content: `🔊 **${target.tag}** kullanıcısının susturulması kaldırıldı.` });
        }

        if (commandName === 'warn') {
            if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: 'Yetkiniz yetersiz!', ephemeral: true });
            const target = options.getUser('hedef');
            const reason = options.getString('sebep');
            if (!db.warnings[target.id]) db.warnings[target.id] = [];
            db.warnings[target.id].push({ reason, date: new Date().toLocaleDateString() });
            saveDB();
            return interaction.reply({ content: `⚠️ **${target.tag}** kişisine uyarı eklendi. Toplam Uyarı: **${db.warnings[target.id].length}**` });
        }

        if (commandName === 'uyarilar') {
            const target = options.getUser('hedef');
            const userWarns = db.warnings[target.id] || [];
            if (userWarns.length === 0) return interaction.reply({ content: `**${target.tag}** kullanıcısının hiç uyarısı yok.` });
            const list = userWarns.map((w, i) => `${i + 1}. ${w.reason} (${w.date})`).join('\n');
            return interaction.reply({ content: `📋 **${target.tag} Uyarı Listesi:**\n${list}` });
        }

        if (commandName === 'lock') {
            if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
            await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
            return interaction.reply({ content: '🔒 Kanal mesaja kapatıldı.' });
        }

        if (commandName === 'unlock') {
            if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
            await channel.permissionOverwrites.edit(guild.id, { SendMessages: true });
            return interaction.reply({ content: '🔓 Kanal tekrar mesaja açıldı.' });
        }

        if (commandName === 'slowmode') {
            if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
            const seconds = options.getInteger('saniye');
            await channel.setRateLimitPerUser(seconds);
            return interaction.reply({ content: `⏱️ Kanal yavaş modu **${seconds}** saniye olarak ayarlandı.` });
        }

        if (commandName === 'otorol') {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Yönetici yetkisi gerekli!', ephemeral: true });
            const role = options.getRole('rol');
            db.autorole[guild.id] = role.id;
            saveDB();
            return interaction.reply({ content: `✅ Otorol **${role.name}** olarak ayarlandı.` });
        }

        if (commandName === 'ticket-kur' || commandName === 'ticket-kur-mequeen') {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Yönetici yetkisi gerekli!', ephemeral: true });
            const targetChannel = options.getChannel('kanal');
            const isMequeen = commandName === 'ticket-kur-mequeen';

            const embed = new EmbedBuilder()
                .setTitle(isMequeen ? '👑 Mequeen Destek & İletişim' : '🎫 Destek Talebi Oluştur')
                .setDescription(isMequeen ? 'Mequeen özel destek hattına hoş geldiniz. Aşağıdaki butona tıklayarak bilet açabilirsiniz.' : 'Sorunlarınız veya sorularınız için aşağıdaki butona tıklayarak destek bileti oluşturabilirsiniz.')
                .setColor(isMequeen ? 0x9b59b6 : 0x3498db);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(isMequeen ? 'ticket_open_mequeen' : 'ticket_open_standard')
                    .setLabel(isMequeen ? '👑 Mequeen Bilet Aç' : '📩 Destek Bileti Aç')
                    .setStyle(isMequeen ? ButtonStyle.Success : ButtonStyle.Primary)
            );

            await targetChannel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✅ Destek sistemi başarıyla kuruldu.', ephemeral: true });
        }

        if (commandName === 'cekilis-baslat') {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Yönetici yetkisi gerekli!', ephemeral: true });
            const odul = options.getString('odul');
            const sure = options.getInteger('sure');
            const kazananSayisi = options.getInteger('kazanan_sayisi');

            const embed = new EmbedBuilder()
                .setTitle('🎉 ÇEKİLİŞ BAŞLADI!')
                .setDescription(`**Ödül:** ${odul}\n**Kazanan Sayısı:** ${kazananSayisi}\n**Süre:** ${sure} dakika\n**Katılmak için aşağıdaki butona basın!**`)
                .setColor(0xf1c40f);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveaway_join').setLabel('🎉 Katıl').setStyle(ButtonStyle.Success)
            );

            const msg = await channel.send({ embeds: [embed], components: [row] });
            db.giveaways[msg.id] = { odul, winnersCount: kazananSayisi, participants: [] };
            saveDB();
            return interaction.reply({ content: 'Çekiliş başlatıldı.', ephemeral: true });
        }

        if (commandName === 'robux') {
            const embed = new EmbedBuilder()
                .setTitle('💎 Studioblox Robux Stok & Fiyatlandırma')
                .setDescription('**Anlık Stok:** Aktif\n**Fiyat:** Lütfen yetkililer ile iletişime geçin.\n\nSatın alım için `/ticket-kur` üzerinden bilet açabilirsiniz.')
                .setColor(0x00ff00);
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'robux-owo-bilgi') {
            const embed = new EmbedBuilder()
                .setTitle('🐾 OwO ile Robux Takas Kuralları')
                .setDescription('1. OwO bakiyesi önceden kontrol edilir.\n2. Dolandırıcılığa karşı bilet açılması zorunludur.\n3. Takas işlemleri yetkili gözetiminde yapılır.')
                .setColor(0xe91e63);
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'basvuru-sistemi') {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Yönetici yetkisi gerekli!', ephemeral: true });
            const targetChannel = options.getChannel('kanal');
            const embed = new EmbedBuilder()
                .setTitle('📝 Yetkili Başvuru Formu')
                .setDescription('Ekibimize katılmak için aşağıdaki **Başvuru Yap** butonuna tıklayarak formu doldurun.')
                .setColor(0x34495e);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_apply_modal').setLabel('📝 Başvuru Yap').setStyle(ButtonStyle.Primary)
            );

            await targetChannel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: 'Başvuru paneli kuruldu.', ephemeral: true });
        }

        if (commandName === 'sayac-kur') {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Yönetici yetkisi gerekli!', ephemeral: true });
            const ch = options.getChannel('kanal');
            const target = options.getInteger('hedef');
            db.usercount[guild.id] = { channelId: ch.id, target };
            saveDB();
            return interaction.reply({ content: `✅ Sayaç kanalı ${ch} ve hedef **${target}** olarak ayarlandı.` });
        }

        if (commandName === 'yardim') {
            const embed = new EmbedBuilder()
                .setTitle('🤖 Studioblox Bot Komut Menüsü')
                .addFields(
                    { name: '🛡️ Moderasyon', value: '`/ban`, `/kick`, `/clear`, `/mute`, `/unmute`, `/warn`, `/uyarilar`, `/lock`, `/unlock`, `/slowmode`, `/otorol`' },
                    { name: '🎫 Destek & Başvuru', value: '`/ticket-kur`, `/ticket-kur-mequeen`, `/basvuru-sistemi`' },
                    { name: '🎉 Çekiliş & Eğlence', value: '`/cekilis-baslat`, `/robux`, `/robux-owo-bilgi`' },
                    { name: '📊 Sistemler', value: '`/sayac-kur`' }
                )
                .setColor(0x5865F2);
            return interaction.reply({ embeds: [embed] });
        }
    }

    if (interaction.isButton()) {
        const { customId, guild, user, channel } = interaction;

        if (customId === 'ticket_open_standard' || customId === 'ticket_open_mequeen') {
            const ticketChannel = await guild.channels.create({
                name: `bilet-${user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle('📩 Destek Talebiniz Açıldı')
                .setDescription(`Merhaba ${user}, yetkililerimiz en kısa sürede sizinle ilgilenecektir.\nBileti kapatmak için aşağıdaki **Kapat** butonuna basabilirsiniz.`)
                .setColor(0x2ecc71);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Bileti Kapat').setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: `Biletiniz açıldı: ${ticketChannel}`, ephemeral: true });
        }

        if (customId === 'ticket_close') {
            await interaction.reply('Bilet 5 saniye içinde kapatılıyor...');
            setTimeout(() => channel.delete().catch(() => {}), 5000);
        }

        if (customId === 'giveaway_join') {
            const giveaway = db.giveaways[interaction.message.id];
            if (!giveaway) return interaction.reply({ content: 'Çekiliş bulunamadı.', ephemeral: true });

            if (giveaway.participants.includes(user.id)) {
                return interaction.reply({ content: 'Zaten bu çekilişe katıldınız!', ephemeral: true });
            }

            giveaway.participants.push(user.id);
            saveDB();
            return interaction.reply({ content: '🎉 Çekilişe başarıyla katıldınız!', ephemeral: true });
        }

        if (customId === 'open_apply_modal') {
            const modal = new ModalBuilder().setCustomId('apply_modal').setTitle('Yetkili Başvuru Formu');
            const ageInput = new TextInputBuilder().setCustomId('age').setLabel('Yaşınız').setStyle(TextInputStyle.Short).setRequired(true);
            const expInput = new TextInputBuilder().setCustomId('exp').setLabel('Tecrübeleriniz ve Kendiniz').setStyle(TextInputStyle.Paragraph).setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(ageInput), new ActionRowBuilder().addComponents(expInput));
            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'apply_modal') {
            const age = interaction.fields.getTextInputValue('age');
            const exp = interaction.fields.getTextInputValue('exp');

            return interaction.reply({ content: `✅ Başvurunuz alındı!\n**Yaş:** ${age}\n**Detay:** ${exp}`, ephemeral: true });
        }
    }
});

// --- 9. BOT GİRİŞİ ---
const botToken = (process.env.TOKEN || '').trim();

if (!botToken) {
    console.error('❌ HATA: Render üzerinde TOKEN bulunamadı!');
} else {
    console.log(`[BILGI] Token bulundu. Bağlantı başlatılıyor...`);
    client.login(botToken).catch(err => {
        console.error('❌ DISCORD LOGIN HATASI:', err);
    });
}
