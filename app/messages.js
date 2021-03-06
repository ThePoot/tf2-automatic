const moment = require('moment');

const utils = require('./utils.js');

let Automatic, client, log, config, Inventory, Prices, Trade, Items;

let cache = {};
const messageInterval = 2000;

exports.register = function (automatic) {
	Automatic = automatic;
	client = automatic.client;
	log = automatic.log;
	config = automatic.config;

	Inventory = automatic.inventory;
	Prices = automatic.prices;
	Backpack = automatic.backpack;
	Trade = automatic.trade;
	Items = automatic.items;
	Friends = automatic.friends;
};

exports.init = function () {
	client.on('friendMessage', friendMessage);
};

function friendMessage(steamID, message) {
	message = message.trim();
	const steamID64 = steamID.getSteamID64();
	log.info('Message from ' + steamID64 + ': ' + message);

	if (!Friends.isFriend(steamID64)) {
		log.debug("Message is not from a friend");
		return;
	}

	if (isSpam(steamID64)) {
		log.debug("Spam...");
		return;
	}

	const command = isCommand(message);
	if (command == 'how2trade') {
		client.chatMessage(steamID64, 'You can either send me an offer yourself, or use one of my two commands to request a trade. They are "!buy" and "!sell". Say you want to buy a Team Captain, just type "!buy The Team Captain".');
	} else if (command == "help") {
		let reply = "Here's a list of all my commands: !help, !how2trade, !stock, !price, !buy, !sell";
		if (Automatic.isOwner(steamID64)) {
			reply += ", !add, !remove, !update";
		}
		client.chatMessage(steamID64, reply);
	} else if (command == "stock") {
		const summary = Inventory.summary();

		let parsed = [];
		// Convert object to array so we can easily sort it.
		for (var name in summary) {
			if (name == "Mann Co. Supply Crate Key" || name == "Refined Metal" || name == "Reclaimed Metal" || name == "Scrap Metal") { continue; }
			parsed.push({ name: name, amount: summary[name] });
		}
		// Sort the array.
		parsed.sort(function (a, b) {
			if (a.amount == b.amount) {
				// Sort alphabetically if the amounts are the same.
				if (a.name < b.name) return -1;
				if (a.name > b.name) return 1;
				return 0;
			}
			return b.amount - a.amount; // High -> Low
		});

		// We want to display the stock of metals and keys at the top.
		const pure = [
			{ name: "Mann Co. Supply Crate Key", amount: Inventory.getAmount("Mann Co. Supply Crate Key") },
			{ name: "Refined Metal", amount: Inventory.getAmount("Refined Metal") },
			{ name: "Reclaimed Metal", amount: Inventory.getAmount("Reclaimed Metal") },
			{ name: "Scrap Metal", amount: Inventory.getAmount("Scrap Metal") }
		];

		// Add the array of pure to the other items.
		parsed.splice(0, 0, ...pure);

		let stock = [],
			left = 0;
		for (var i = 0; i < parsed.length; i++) {
			// We will max show 20 different items in the message, we don't want it to be too big.
			if (stock.length > 20) {
				left += parsed[i].amount;
			} else {
				stock.push(parsed[i].name + ": " + parsed[i].amount);
			}
		}
		let reply = "Here's a list of all the items that I have in my inventory:\n" + stock.join(", \n");
		if (left > 0) {
			reply += ",\nand " + left + " other " + utils.plural("item", left);
		}
		reply += ".";
		client.chatMessage(steamID64, reply);
	} else if (command == "price") {
		const name = message.substr(message.toLowerCase().indexOf("price") + 6);
		if (name == "") {
			client.chatMessage(steamID64, "You forgot to add a name. Here's an example: \"!price Team Captain\"");
			return;
		}

		let match = Prices.findMatch(name);
		if (match == null) {
			client.chatMessage(steamID64, "I could not find any items in my pricelist that contains \"" + name + "\", I might not be trading the item you are looking for.");
			return;
		} else if (Array.isArray(match)) {
			const n = match.length;
			if (match.length > 20) {
				match = match.splice(0, 20);
			}
			let reply = "I found " + n + " " + utils.plural("item", n) + " that contains \"" + name + "\". Try with one of the items shown below:\n" + match.join(',\n');
			if (n > match.lenght) {
				const other = n - match.length;
				reply += ",\nand " + other + " other " + utils.plural("item", other) + ".";
			}

			client.chatMessage(steamID64, reply);
			return;
		}

		const buy = utils.currencyAsText(match.price.buy),
			sell = utils.currencyAsText(match.price.sell);
		
		const inInv = Inventory.getAmount(match.item.name),
			limit = config.getLimit(match.item.name);
		
		let reply = "I am buying a " + match.item.name + " for " + buy + " and selling for " + sell + ". I have " + inInv;
		if (limit != -1) {
			reply += " / " + limit;
		}
		if (Automatic.isOwner(steamID64)) {
			const date = moment(match.time_updated * 1000).format("DD-MM-YYYY HH:mm:ss");
			reply += " (last updated " + date + ")";
		}
		reply += ".";

		client.chatMessage(steamID64, reply);
	} else if (command == "message" && true == false) {
		if (Automatic.isOwner(steamID64)) {
			client.chatMessage(steamID64, "You can't message yourself.");
			return;
		}
		const owners = config.get().owners;
		if (!owners || owners.length == 0) {
			client.chatMessage(steamID64, "Sorry, but there are noone that you can message :(");
			return;
		}

		const msg = message.substr(message.toLowerCase().indexOf("message") + 8);
		if (msg == "") {
			client.chatMessage(steamID64, "Please include a message. Here's an example: \"!message Hi\"");
			return;
		}

		// Todo: check if owners are online. Get name of user and send that in the message aswell.
		for (let i = 0; i < owners.length; i++) {
			const id64 = owners[i];
			client.chatMessage(id64, "Message from " + steamID64 + ": " + msg);
		}

		client.chatMessage(steamID64, "Your message has been sent.");
	} else if (command == "reply" && Automatic.isOwner(steamID64) && true == false) {

	} else if (command == "add" && Automatic.isOwner(steamID64)) {
		const string = message.substr(message.toLowerCase().indexOf("add") + 4);
		let input = utils.stringToObject(string);
		if (input == null) {
			client.chatMessage(steamID64, "Your syntax is wrong. Here's an example: \"!add name=Rocket Launcher&quality=Strange\"");
			return;
		}

		if (typeof input.name == 'string') {
			input.name = input.name.trim();
		}

		if (!input.name) {
			client.chatMessage(steamID64, "You are missing a name. Here's an example: \"!add name=Rocket Launcher\"");
			return;
		}

		let match = Items.findMatch(input.name);
		if (match == null) {
			client.chatMessage(steamID64, "I could not find any items in schema that contains \"" + input.name + "\".");
			return;
		} else if (Array.isArray(match)) {
			const n = match.length;
			if (match.length > 20) {
				match = match.splice(0, 20);
			}
			let reply = "I found " + n + " " + utils.plural("item", n) + " that contains \"" + input.name + "\". Try with one of the items shown below:\n" + match.join(',\n');
			if (n > match.length) {
				const other = n - match.length;
				reply += ",\nand " + other + " other " + utils.plural("item", other) + ".";
			}

			client.chatMessage(steamID64, reply);
			return;
		}

		let limit = null;
		if (input.limit && input.limit != "") {
			limit = parseInt(input.limit);
			if (limit == NaN) {
				client.chatMessage(steamID64, "\"" + input.limit + "\" is not a valid limit. Here's an example: \"!add name=" + match + "&limit=2\"");
				return;
			}

			if (limit < -1) {
				client.chatMessage(steamID64, "\"" + input.limit + "\" is not a valid limit. You can use -1 for unlimited, 0 for no buying, 1 for a limit of 1...");
				return;
			}
		}

		let item = {
			defindex: match,
			quality: 6,
			craftable: input.craftable ? input.craftable == 'true' : true,
			killstreak: parseInt(input.killstreak) || 0,
			australium: input.australium ? input.australium == 'true' : false
		};

		if (input.quality) {
			const quality = Items.getQuality(input.quality);
			if (quality == null) {
				client.chatMessage(steamID64, "Did not find a quality like \"" + input.quality + "\".");
				return;
			}
			item.quality = quality;
		}

		Prices.addItems([item], function (err, added) {
			if (err) {
				client.chatMessage(steamID64, "I failed to add the item to the pricelist: " + (err.reason || err.message));
				return;
			}

			if (added == 1) {
				const name = Items.getName(item);

				config.addLimit(name, limit);

				let reply = "\"" + name + "\" has been added to the pricelist";
				if (limit != null) {
					reply += " with a limit of " + limit;
				}
				reply += " (might take some time to update).";
				client.chatMessage(steamID64, reply);
			} else {
				client.chatMessage(steamID64, "No items were added, something might have went wrong.");
			}
		});
	} else if (command == "remove" && Automatic.isOwner(steamID64)) {
		const string = message.substr(message.toLowerCase().indexOf("remove") + 7);
		let input = utils.stringToObject(string);
		if (input == null) {
			client.chatMessage(steamID64, "Your syntax is wrong. Here's an example: \"!remove items=Strange Rocket Launcher, Strange Australium Rocket Launcher\"");
			return;
		}

		let items = input.items;
		if (!items || items == "") {
			client.chatMessage(steamID64, "You are missing items. Here's an example: \"!remove items=Strange Rocket Launcher, Strange Australium Rocket Launcher\"");
			return;
		}

		items = items.trim().replace(/  +/g, '').replace(/, /g, ',').split(',');

		Prices.removeItems(items, function (err, removed) {
			if (err) {
				client.chatMessage(steamID64, "I failed to remove the item(s) from the pricelist: " + (err.reason || err.message));
				return;
			}

			if (removed > 0) {
				client.chatMessage(steamID64, removed + " " + utils.plural("item", removed) + " has been removed from the pricelist (might take some time to update).");
			} else {
				client.chatMessage(steamID64, "No items were removed. Try and write out the name exactly as it is in the pricelist.");
			}
		});
	} else if (command == "update" && Automatic.isOwner(steamID64)) {
		Prices.update(function (err) {
			if (err) {
				if (err.message == "Too Many Requests") {
					client.chatMessage(steamID64, "I failed to update the pricelist, try again in " + (err.retryAfter / 1000) + " " + utils.plural("second", err.retryAfter / 1000) + ".");
				} else {
					client.chatMessage(steamID64, "I failed to update the pricelist: " + (err.reason || err.message));
				}
				return;
			}

			client.chatMessage(steamID64, "The pricelist has been refreshed.");
		});
	} else if (command == "buy" || command == "sell") {
		let name = message.substr(message.toLowerCase().indexOf(command) + command.length + 1);
		let amount = 1;
		if (/^[+\-]?\d+$/.test(name.split(' ')[0])) {
			amount = parseInt(name.split(' ')[0])
			name = name.replace(amount, '').trim();
		}

		if (name == "") {
			client.chatMessage(steamID64, "You forgot to add a name. Here's an example: \"!buy Team Captain\"");
			return;
		}

		// Make sure that the amountF is always 1 or higher.
		if (1 > amount) {
			amount = 1;
		} else if (10 < amount) {
			// Limit trades to 10 items.
			amount = 10;
		}

		let match = Prices.findMatch(name);
		if (match == null) {
			client.chatMessage(steamID64, "I could not find any items in my pricelist that contains \"" + name + "\", I might not be trading the item you are looking for.");
			return;
		} else if (Array.isArray(match)) {
			const n = match.length;
			if (match.length > 20) {
				match = match.splice(0, 20);
			}
			let reply = "I found " + n + " " + utils.plural("item", n) + " that contains \"" + name + "\". Try with one of the items shown below:\n" + match.join(',\n');
			if (n > match.lenght) {
				const other = n - match.length;
				reply += ",\nand " + other + " other " + utils.plural("item", other) + ".";
			}

			client.chatMessage(steamID64, reply);
			return;
		}
		const selling = command == "buy";
		Trade.requestOffer(steamID64, match, amount, selling);
	} else {
		client.chatMessage(steamID64, "I don't know what you mean, please type \"!help\" for all my commands!");
	}
}

function isCommand(message) {
	if (message.startsWith('!') || message.startsWith('/') || message.startsWith('.')) {
		const command = message.toLowerCase().split(" ")[0].substr(1);
		return command;
	} else {
		return false;
	}
}

function isSpam(key) {
	let count = (cache[key] || 0) + 1;
	cache[key] = count;
	return count > 1;
}

setInterval(function() {
	cache = {};
}, messageInterval);