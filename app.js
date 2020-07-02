var mysql = require('mysql');
const configjson = require('./config.json');
const environment = process.env.NODE_ENV || 'development';
const config = Object.assign(configjson['development'], configjson[environment]); ;
const Discord = require('discord.js');
const client = new Discord.Client(config.DiscordClient);
const { version } = require('os');
const { link } = require('fs');
console.log('Environment is ' + environment);

var connection;
let db = null;
let server = null;
let lastMsgId = -1;
let responseTimer = null;
let isPolling = false;
let isResponding = false;
let queuedResponses = [];

function handleMsg(isServer, message) {
	if (isServer && message.channel.id === config.GlobalChatChannelId) {
		handleServerChatMsg(message);
    }
}
function handleServerChatMsg(message) {
	const isAdmin = msg.member.hasPermission("ADMINISTRATOR");
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
		Message: message.content,
		Type: 0,
		Rcon: 0,
		Icon: icon
	};
	queuedResponses.push(item);
}
function handleResponses() {
	if (!isResponding && queuedResponses.length > 0) {
		isResponding = true;
		console.log(queuedResponses);
		db.query(
				'INSERT INTO Messages (At,ServerKey,ServerTag,RecipientIds,PlayerName,CharacterName,TribeName,TribeId,Message,Type,Icon,Rcon) VALUES ?',
			[queuedResponses.map(item => [item.At, item.ServerKey, item.ServerTag, item.RecipientIds, item.PlayerName, item.CharacterName, item.TribeName, item.TribeId, item.Message, item.Type, item.Icon, item.Rcon])],
			(error, results) => {
				if (error) throw error;
				console.log("Responded :)", results);

				isResponding = false;
            }
		);
		queuedResponses = [];
    }
}

function sendMsgToDiscordGlobalChat(message) {
	const globalDiscord = server.channels.cache.get(config.GlobalChatChannelId);
	let globalMsg = `(${message.ServerTag})`;
	if (message.Icon === 1) {
		globalMsg += " [ADMIN]";
	} else if (message.Icon > 2) {
		globalMsg += " [VIP]";
	}
	globalMsg += " " + message.PlayerName;
	if (message.TribeName.length > 0) {
		globalMsg += ` [${message.TribeName}]`;
	}
	globalMsg += ": " + message.Message;
	globalDiscord.send(globalMsg);
}

// TRIBE_DISCORDS
// Id
// invite_id
// Discord_Id
// Chat_Channel_ID
// Tribe_Ids
// Response goes to only those tribe ids regardless of recipient_ids

function sendMsgToTribeDiscords(msg) {
	// Need list of discord Ids & channel Ids to tribeIds
	// Tribe owner only?
	// in discord /tribeLink
	// have your tribeOwner use "/linkTribe asdg346zxdh98dtq2w3495ASDT9hwa465a" on each map
}

function handleDbMsg(msg) {
	if (msg.ServerKey !== "Discord") {
		if (msg.Type === 0) {
			sendMsgToDiscordGlobalChat(msg);
		} else {
			sendMsgToTribeDiscords(msg);
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
	db.query("SELECT Id,At,ServerKey,ServerTag,SteamId,RecipientIds,PlayerName,CharacterName,TribeName,Message,Type,Rcon,Icon" +
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
			dbhandleDisconnect();						// lost due to either server restart, or a
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
