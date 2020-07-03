var mysql = require('mysql');
const configjson = require('./config.json');
const environment = process.env.NODE_ENV || 'development';
const config = Object.assign(configjson['development'], configjson[environment]); ;
const Discord = require('discord.js');
const client = new Discord.Client(config.DiscordClient);
const { version } = require('os');
const { link } = require('fs');
const newLine = `
`;
const quoteStr = "```";
console.log('Environment is ' + environment);

var connection;
let db = null;
let server = null;
let lastMsgId = -1;
let responseTimer = null;
let isPolling = false;
let isResponding = false;
let queuedResponses = [];
let lastGlobalMsg = null;
let lastGlobalMsgStr = "";

const createMessagesIfNotExist =
	"CREATE TABLE IF NOT EXISTS Messages (" +
	"Id INT NOT NULL AUTO_INCREMENT," +
	"At BIGINT(11) DEFAULT 0," +
	"ServerKey VARCHAR(50) DEFAULT ''," +
	"ServerTag VARCHAR(50) DEFAULT ''," +
	"SteamId BIGINT(11) DEFAULT 0," +
	"RecipientIds NVARCHAR(500) DEFAULT ''," +
	"PlayerName VARCHAR(100) DEFAULT ''," +
	"CharacterName VARCHAR(100) DEFAULT ''," +
	"TribeName VARCHAR(100) DEFAULT ''," +
	"TribeId BIGINT(11) DEFAULT 0," +
	"Message VARCHAR(300) DEFAULT ''," +
	"Type INT DEFAULT 0," +
	"Rcon INT DEFAULT 0," +
	"Icon INT DEFAULT 0," +
	"PRIMARY KEY(Id)" +
	");";


const createTribesIfNotExist =
	"CREATE TABLE IF NOT EXISTS Messages (" +
	"Id INT NOT NULL AUTO_INCREMENT," +
	"At BIGINT(11) DEFAULT 0," +
	"ServerKey VARCHAR(50) DEFAULT ''," +
	"ServerTag VARCHAR(50) DEFAULT ''," +
	"SteamId BIGINT(11) DEFAULT 0," +
	"RecipientIds NVARCHAR(500) DEFAULT ''," +
	"PlayerName VARCHAR(100) DEFAULT ''," +
	"CharacterName VARCHAR(100) DEFAULT ''," +
	"TribeName VARCHAR(100) DEFAULT ''," +
	"TribeId BIGINT(11) DEFAULT 0," +
	"Message VARCHAR(300) DEFAULT ''," +
	"Type INT DEFAULT 0," +
	"Rcon INT DEFAULT 0," +
	"Icon INT DEFAULT 0," +
	"PRIMARY KEY(Id)" +
	");";

let tribeChannels = [
	{
		Id: 1,
		DiscordId: "728496485171462155",
		CanTwoWay: true,
		TribeIds: [
			1356756801
		],
		ChatInviteCode: "abc",
		Servers: [
			{
				TribeChannelId: 1,
				ServerKey: "Ragnarok",
				ChatChannelId: "728496485699682377",
				LastMsgString: "",
				LastMsgRef: null
			},
			{
				TribeChannelId: 1,
				ServerKey: "Aberration",
				ChatChannelId: "728496485699682377",
				LastMsgString: "",
				LastMsgRef: null
			},
			{
				TribeChannelId: 1,
				ServerKey: "Crystal",
				ChatChannelId: "728496485699682377",
				LastMsgString: "",
				LastMsgRef: null
			}
		]
	},
];
let globalChannelConfig = {
	Id: 0,
	DiscordId: config.HostServerDiscordId,
	ChatChannelId: config.GlobalChatChannelId,
	LastMsgString: "",
	isGlobal: true,
	LastMsgRef: null,
	CanTwoWay: true,
	ChatInviteCode: "",
	Tribes: []
};
let channelConfigs = [
	globalChannelConfig,
	{
		Id: 1,
		DiscordId: "728496485171462155",
		ChatChannelId: "728496485699682377",
		LastMsgString: "",
		LastMsgRef: null,
		CanTwoWay: true,
		ChatInviteCode: "abc",
		Tribes: [
			{
				ServerKey: "Ragnarok",
				TribeId: 1356756801
			}
		]
	},
];

// TribeChannels
//	Id,DiscordId,ChatChannelId,CanTwoWay,ChatInviteCode, LEFT OUTER JOIN Tribes
// Tribes
//  TribeChannelId, ServerKey, TribeId

// Helpers
function getChannelConfigByTribeId(tribeId) {
	return tribeId > 0 && channelConfigs.find(channelConfig => channelConfig.Tribes.find(tribe => tribe.TribeId == tribeId));
}
function getChannelConfigByChannelId(channelId) {
	return channelId && channelConfigs.find(channelConfig => channelConfig.ChatChannelId == channelId);
}

function getChatString(message) {
	if (message.Message.length == 0) return "";
	let extraTag = '';
	let nameTag = message.PlayerName;
	const isTribeChat = (message.Type == 1 || message.Type == 5 || message.Type == 6);
	if (!isTribeChat && message.Icon === 1) {
		extraTag = " <Admin>";
	} else if (!isTribeChat && message.Icon > 2) {
		extraTag = " <VIP>";
	}
	if (message.TribeName.length > 0) {
		nameTag += ` [${message.TribeName}]`;
	}
	if (isTribeChat) {
		if (message.TribeName.length ==- 0) {
			nameTag += " ";
		}
		nameTag += "(TRIBE)";
    }
	const d = new Date();

	let timeStr = `[${d.toLocaleTimeString("it-IT").split(' ')[0]}]`;
	const msgStr = message.Message.replace(new RegExp(quoteStr, "g"), "").replace(new RegExp(newLine, "g"), "");
	return `${newLine}${timeStr}(${message.ServerTag})${extraTag} ${nameTag}: ${msgStr}`;
}

// Combined Chat
function handleChatMsg(message, channelConfig) {
	let icon = 0;
	if (channelConfig.isGlobal && message.member.hasPermission("ADMINISTRATOR")) {
		icon = 1;
	}
	// If Donor icon = 2,3,4
	const item = {
		At: new Date().getTime(),
		ServerKey: 'Discord',
		ServerTag: 'Discord',
		SteamId: '',
		RecipientIds: channelConfig.Tribes.map(tribe => tribe.TribeId).join(","),
		PlayerName: message.author.username,
		CharacterName: message.author.username,
		TribeName: "",
		TribeId: "",
		Message: message.content,
		Type: (channelConfig.isGlobal ? 0 : 6),
		Rcon: 0,
		Icon: icon
	};
	addMsgToChannel(getChatString(item), channelConfig);
	message.delete();
	queuedResponses.push(item);
}
function addMsgToChannel(newChatStr, channelConfig) {
	if (newChatStr.length == 0) return;
	const configServer = client.guilds.cache.get(channelConfig.DiscordId);
	if (!configServer) {
		console.log("Couldnt Find server", channelConfig);
		return;
	}
	const discordChannel = configServer.channels.cache.get(channelConfig.ChatChannelId);
	if (!discordChannel) {
		console.log("Couldnt Find chat channel", channelConfig);
		return;
	}
	if (channelConfig.LastMsgString.length + newChatStr.length > config.MaxMsgLength) {
		channelConfig.LastMsgString = "";
		channelConfig.LastMsgRef = null;
	}
	channelConfig.LastMsgString += newChatStr;
	if (channelConfig.LastMsgRef) {
		channelConfig.LastMsgRef.edit(`${quoteStr}md${channelConfig.LastMsgString}${newLine}${quoteStr}`)
		.then(result => channelConfig.LastMsgRef = result);
	} else {
		discordChannel.send(`${quoteStr}md${channelConfig.LastMsgString}${newLine}${quoteStr}`)
		.then(result => channelConfig.LastMsgRef = result);
	}
}

// Database
function reconnectDatabase() {
	db = mysql.createConnection({ host: config.Database.host, user: config.Database.user, password: config.Database.password, supportBigNumbers: true, bigNumberStrings: true });
	// Recreate the connection, since
	// the old one cannot be reused.

	db.connect(error => { // The server is either down
		if (error) {		// or restarting (takes a while sometimes).
			console.log('DB Connection Error:', error);
			setTimeout(dbhandleDisconnect, 2000);
			// We introduce a delay before attempting to reconnect,
			// to avoid a hot loop, and to allow our node script to
			// procesar asynchronous requests in the meantime.
			// If you're also serving http, display a 503 error.
		}
		db.query('USE `' + config.Database.database + '`;', (error, results) => {
			if (error) { console.log('DB Error:', error); return false; }
			console.log('DB Connection successful.');
			initBot();
		});
	});

	db.on('error', function (err) {
		console.log('DB Error: ', err);
		if (err.code === 'PROTOCOL_CONNECTION_LOST') {	// Connection to the MySQL server is usually
			console.log('DB Connection error.');
			reconnectDatabase();						// lost due to either server restart, or a
		} else {										// connnection idle timeout (the wait_timeout
			throw err;									// server variable configures this)
		}
	});
}
function pollDatabase() {
	if (lastMsgId >= 0 && !isPolling) {
		isPolling = true;
		db.query("SELECT Id,At,ServerKey,ServerTag,SteamId,RecipientIds,PlayerName,CharacterName,TribeName,TribeId,Message,Type,Rcon,Icon" +
			" FROM Messages WHERE Id > " + lastMsgId + " ORDER BY Id ASC;", function (err, result) {
				if (err) throw err;
				handleDbMsgs(result);
			});
	}
}
function handleDbMsgs(msgs) {
	isPolling = false;
	for (let msg of msgs) {
		if (msg.ServerKey !== "Discord") {
			const msgConfig = (msg.Type == 0) ? globalChannelConfig : getChannelConfigByTribeId(msg.TribeId);
			if (msgConfig) {
				addMsgToChannel(getChatString(msg), msgConfig);
            }
		}
		lastMsgId = msg.Id;
    }
}

// Discord
function handleResponses() {
	if (!isResponding && queuedResponses.length > 0) {
		isResponding = true;
		console.log(`Inserting ${queuedResponses.length} Responses to db`);
		db.query(
				'INSERT INTO Messages (At,ServerKey,ServerTag,RecipientIds,PlayerName,CharacterName,TribeName,Message,Type,Icon,Rcon) VALUES ?',
			[queuedResponses.map(item => [item.At, item.ServerKey, item.ServerTag, item.RecipientIds, item.PlayerName, item.CharacterName, item.TribeName, item.Message, item.Type, item.Icon, item.Rcon])],
			(error, results) => {
				if (error) throw error;

				isResponding = false;
            }
		);
		queuedResponses = [];
    }
}

function initBot() {
	if (!!server && !!db) {
		// Add timer to query sql
		const pollRate = config.PollRate || 1000;
		const responsePollRate = config.ResponsePollRate || 1000;
		setInterval(function () { pollDatabase(); }, pollRate);
		setInterval(function () { handleResponses(); }, responsePollRate);
		db.query("SELECT Id FROM Messages ORDER BY Id DESC LIMIT 1;", function (err, result) {
			if (err) throw err;
			if (result && result.length > 0) {
				lastMsgId = result[0].Id || 0;
			} else {
				lastMsgId = 0;
			}
			console.log("Last Message ID: " + lastMsgId);
		});
    }
}

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	server = client.guilds.cache.get(config.HostServerDiscordId);
	if (!server) {
		console.log('Could not connect to server discord');
	} else {
		initBot();
    }
});
client.on('error', console.error);
client.on('message', message => {
	// Any discord server that has bot got a message
	if (!message.guild || message.author.bot) return;
	let channelConfig = getChannelConfigByChannelId(message.channel.id);
	if (!channelConfig) return;
	handleChatMsg(message, channelConfig);
});
console.log('Running ARK Discord Bot v'+config.version.join('.'));

client.login(config.Token);
reconnectDatabase();
