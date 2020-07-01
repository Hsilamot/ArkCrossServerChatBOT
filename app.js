var mysql = require('mysql');
const configjson = require('./config.json');
const environment = process.env.NODE_ENV || 'development';
const config = Object.assign(configjson['development'], configjson[environment]); ;
console.log('Environment is '+environment);

var connection;
let db = null;


//var db = mysql.createConnection();
function dbhandleDisconnect() {
	db = mysql.createConnection({ host: config.Database.host, user: config.Database.user, password: config.Database.password, supportBigNumbers: true, bigNumberStrings: true});
	// Recreate the connection, since
	// the old one cannot be reused.

	db.connect(error => { // The server is either down
		if(error) {		// or restarting (takes a while sometimes).
			console.log('DB Connection Error:', error);
			setTimeout(dbhandleDisconnect, 2000);
			// We introduce a delay before attempting to reconnect,
			// to avoid a hot loop, and to allow our node script to
			// procesar asynchronous requests in the meantime.
			// If you're also serving http, display a 503 error.
		}
		db.query('USE `'+config.Database.database+'`;',(error,results) => {
			if (error) {console.log('DB Error:', error); return false;}
			console.log('DB Connection successful.');
		});
	});

	db.on('error', function(err) {
		console.log('DB Error: ', err);
		if(err.code === 'PROTOCOL_CONNECTION_LOST') {	// Connection to the MySQL server is usually
			dbhandleDisconnect();						// lost due to either server restart, or a
		} else {										// connnection idle timeout (the wait_timeout
			throw err;									// server variable configures this)
		}
	});
}
dbhandleDisconnect();

const Discord = require('discord.js');
const client = new Discord.Client(config.DiscordClient);
const { version } = require('os');
const { link } = require('fs');


client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});
client.on('error', console.error);
client.on('message', message => {
	if (!message.guild) return;

});
console.log('Running ARK Discord Bot v'+config.version.join('.'));
client.login(config.Token);