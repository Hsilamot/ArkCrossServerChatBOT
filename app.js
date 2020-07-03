var mysql = require('mysql');
const configjson = require('./config.json');
const environment = process.env.NODE_ENV || 'development';
const config = Object.assign(configjson['development'], configjson[environment]); ;
const Discord = require('discord.js');
const client = new Discord.Client(config.DiscordClient);
const { version } = require('os');
const { link } = require('fs');
const emojiLetters = {
	a: '🇦', b: '🇧', c: '🇨', d: '🇩',
	e: '🇪', f: '🇫', g: '🇬', h: '🇭',
	i: '🇮', j: '🇯', k: '🇰', l: '🇱',
	m: '🇲', n: '🇳', o: '🇴', p: '🇵',
	q: '🇶', r: '🇷', s: '🇸', t: '🇹',
	u: '🇺', v: '🇻', w: '🇼', x: '🇽',
	y: '🇾', z: '🇿', '-': '-'
};
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

let tribeChannels = [
	{
		Id: 1,
		DiscordId: "728496485171462155",
		CanTwoWay: true,
		TribeIds: [
			1356756801
		],
		ChatInviteCode: "abc",
		Servers: {
			Ragnarok: {
				ChatChannelId: "728496485699682377",
				LastMsgString: "",
				LastMsgRef: null
			},
			Aberration: {
				ChatChannelId: "728496485699682377",
				LastMsgString: "",
				LastMsgRef: null
			},
			Crystal: {
				ChatChannelId: "728496485699682377",
				LastMsgString: "",
				LastMsgRef: null
			}
		}
	},
];
function getTribeConfigByTribeId(tribeId) {
	return tribeId > 0 && tribeChannels.find(tribe => tribe.TribeIds.find(id => id == tribeId));
}
function getTribeConfigByChannelId(channelId) {
	return channelId && tribeChannels.find(tribe => {
		for (let serverIndex of config.ServerKeys) {
			if (tribe.Servers[serverIndex].ChatChannelId == channelId) {
				return true;
            }
        }
	});
}
function handleMsg(isServer, message) {
	if (isServer && message.channel.id === config.GlobalChatChannelId) {
		handleServerChatMsg(message);
	} else {
		const tribeConfig = getTribeConfigByChannelId(message.channel.id);
		if (tribeConfig) {
			handleTribeChatMsg(message, tribeConfig);
        }
    }
}
function handleTribeChatMsg(message, tribeConfig) {
	console.log("Tribe Response");
	const item = {
		At: new Date().getTime(),
		ServerKey: 'Discord',
		ServerTag: 'Discord',
		SteamId: '',
		RecipientIds: tribeConfig.TribeIds.join(","),
		PlayerName: message.author.username,
		CharacterName: message.author.username,
		TribeName: "",
		TribeId: "",
		Message: message.content,
		Type: 6,
		Rcon: 0,
		Icon: 0
	};
	sendMsgToTribeDiscords(item, tribeConfig, message.channel.id);
	message.delete();
	queuedResponses.push(item);
}

function handleServerChatMsg(message) {
	const isAdmin = message.member.hasPermission("ADMINISTRATOR");
	let icon = 0;
	if (isAdmin) {
		icon = 1;
	}
	// If Donor icon = 2,3,4
	const item = {
		At: new Date().getTime(),
		ServerKey: 'Discord',
		ServerTag: 'Discord',
		SteamId: '',
		RecipientIds: '',
		PlayerName: message.author.username,
		CharacterName: message.author.username,
		TribeName: "",
		TribeId: "",
		Message: message.content,
		Type: 0,
		Rcon: 0,
		Icon: icon
	};
	addToDiscordMsgs(getChatString(item));
	message.delete();
	queuedResponses.push(item);
}
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
function addToDiscordMsgs(newChatStr) {
	if (newChatStr.length == 0) return;
	const globalDiscord = server.channels.cache.get(config.GlobalChatChannelId);
	if (!globalDiscord) return;
	if (lastGlobalMsgStr.length + newChatStr.length > config.MaxMsgLength) {
		lastGlobalMsgStr = "";
		lastGlobalMsg = null;
    }
	lastGlobalMsgStr += newChatStr;
	if (lastGlobalMsg) {
		lastGlobalMsg.edit(`${quoteStr}md${lastGlobalMsgStr}${newLine}${quoteStr}`).then(result => {
			lastGlobalMsg = result;
		});
	} else {
		globalDiscord.send(`${quoteStr}md${lastGlobalMsgStr}${newLine}${quoteStr}`).then(result => {
			lastGlobalMsg = result;
		});
    }
}
function emojify(str) {
	return [...str].map(letter => (emojiLetters[letter] || letter)).join('');
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
		nameTag += "(TRIBE)";
    }
	const d = new Date();

	let timeStr = `[${d.toLocaleTimeString("it-IT").split(' ')[0]}]`;
	const msgStr = message.Message.replace(new RegExp(quoteStr, "g"), "").replace(new RegExp(newLine, "g"), "");
	return `${newLine}${timeStr}(${message.ServerTag})${extraTag} ${nameTag}: ${msgStr}`;
}
function sendMsgToTribeDiscords(msg, tribeConfig, channelId) {
	const msgStr = getChatString(msg);
	if (msgStr.length == 0 || !tribeConfig) return;
	const tribeServer = client.guilds.cache.get(tribeConfig.DiscordId);
	let tribeServerConfig;
	if (channelId > 0) {
		for (let serverIndex of config.ServerKeys) {
			if (tribeConfig.Servers[serverIndex].ChatChannelId == channelId) {
				tribeServerConfig = tribeConfig.Servers[serverIndex];
				break;
			}
		}
	} else {
		tribeServerConfig = tribeConfig.Servers[msg.ServerKey];
	}
	const tribeChatChannel = tribeServer && tribeServerConfig && tribeServer.channels.cache.get(tribeServerConfig.ChatChannelId);
	if (tribeChatChannel) {
		console.log("Insert msg to tribe channel");
		if (tribeServerConfig.LastMsgString.length + msgStr.length > config.MaxMsgLength) {
			tribeServerConfig.LastMsgString = "";
			tribeServerConfig.LastMsgRef = null;
		}
		tribeServerConfig.LastMsgString += msgStr;
		if (tribeServerConfig.LastMsgRef) {
			tribeServerConfig.LastMsgRef.edit(`${quoteStr}md${tribeServerConfig.LastMsgString}${newLine}${quoteStr}`).then(result => {
				tribeServerConfig.LastMsgRef = result;
			});
		} else {
			tribeChatChannel.send(`${quoteStr}md${tribeServerConfig.LastMsgString}${newLine}${quoteStr}`).then(result => {
				tribeServerConfig.LastMsgRef = result;
			});
		}
    }
}
function handleDbMsg(msg) {
	if (msg.ServerKey !== "Discord") {
		if (msg.Type === 0) {
			addToDiscordMsgs(getChatString(msg))
		} else {
			sendMsgToTribeDiscords(msg, getTribeConfigByTribeId(msg.TribeId));
		}
	}
	lastMsgId = msg.Id;
}
function handleDbMsgs(msgs) {
	isPolling = false;
	for (let i = 0; i < msgs.length; i++) {
		handleDbMsg(msgs[i]);
    }
}
function getNewMessages() {
	isPolling = true;
	db.query("SELECT Id,At,ServerKey,ServerTag,SteamId,RecipientIds,PlayerName,CharacterName,TribeName,TribeId,Message,Type,Rcon,Icon" +
		" FROM Messages WHERE Id > " + lastMsgId + " ORDER BY Id ASC;", function (err, result) {
			if (err) throw err;
			handleDbMsgs(result);
		});
}
function pollDatabase() {
	if (lastMsgId >= 0 && !isPolling) {
		getNewMessages();
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
	if (!message.guild) return;
	const isServer = message.guild.id === config.HostServerDiscordId;
	if (!message.author.bot) {
		handleMsg(isServer, message);
    }
});
console.log('Running ARK Discord Bot v'+config.version.join('.'));

client.login(config.Token);
reconnectDatabase();
