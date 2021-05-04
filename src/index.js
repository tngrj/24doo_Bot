require('dotenv').config();
const { Telegraf, Markup, Stage, session, Scenes } = require('telegraf');
const express = require('express');
const admin = require('firebase-admin');
const moment = require('moment');

//Initializing Bot
const bot = new Telegraf(process.env.TOKEN);

//Initialize Firebase Admin
admin.initializeApp({
	credential: admin.credential.cert({
		projectId: process.env.PROJECT_ID,
		private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
		client_email: process.env.CLIENT_EMAIL,
	}),
	databaseURL: process.env.DATABASE_URL,
});

// Initialise Express
const app = express();
bot.telegram.setWebhook(`${process.env.HEROKU_URL}${process.env.API_TOKEN}`);
app.use(bot.webhookCallback(`${process.env.API_TOKEN}`));

app.listen(process.env.PORT || 3000, () => {
	console.log(`24 DOO Bot listening on port ${process.env.PORT}!`);
});

// Date Generation
let newDate = new Date();
let date = moment().format('DDMMYY');

bot.command('start', (ctx) => {
	ctx.replyWithHTML(
		`Welcome to <b>24 SA DOO Reporting Bot</b>. Do /report to start a report to send to the DOO`
	);
});

//Allows DOO to set their name

// This was to initially generate the branch for us to read the doo name
// bot.command('generate', (ctx) => {
// 	let BDS = admin.database().ref('dooReport/');
// 	Placeholder = '[DOO NAME]';
// 	BDS.set({
// 		dooName: Placeholder,
// 	});
// });

let dooName;

admin
	.database()
	.ref('dooReport/')
	.once('value', (x) => {
		dooName = x.val().dooName;
	});

bot.hears(/^\/doo (.*)$/, (ctx) => {
	dooName = ctx.match[1];
	if (dooName === undefined) {
		ctx.reply('Pleae key in a name!');
		return;
	}
	admin.database().ref('dooReport/').update({
		dooName: dooName,
	});
	ctx.reply(`Today's DOO is ${dooName}.`);
});

// Generates a template to send to the DOO when people report sick
const userWizard = new Scenes.WizardScene(
	'user-wizard',
	(ctx) => {
		ctx.replyWithHTML(
			`Use /cancel at any stage to get out of reporting.\n\nEnter the <b>rank and name</b> that reported sick.`
		);
		return ctx.wizard.next();
	},
	(ctx) => {
		ctx.scene.session.nameNrank = ctx.message.text.toUpperCase();
		ctx.reply(
			'Which Battery is he / she from?',
			Markup.keyboard([['DRAGNIX', 'GRYPHON', 'CENTAUR', 'KIRIN', 'STORM']])
				.oneTime()
				.resize()
		);
		return ctx.wizard.next();
	},
	(ctx) => {
		ctx.scene.session.battery = ctx.message.text;
		ctx.reply(
			'Did he report sick in camp or outside camp?',
			Markup.inlineKeyboard([
				[
					Markup.button.callback('In Camp', 'inCamp'),
					Markup.button.callback('Outside Camp', 'outsideCamp'),
				],
			])
		);
	},
	(ctx) => {
		ctx.scene.session.location = ctx.message.text.toUpperCase();
		ctx.reply('Enter masked NRIC.');
		return ctx.wizard.next();
	},
	(ctx) => {
		ctx.scene.session.ic = ctx.message.text.toUpperCase();
		ctx.reply('Enter estimated time that he reported sick. (Without HRS)');
		return ctx.wizard.next();
	},
	(ctx) => {
		if (!ctx.message.text.match('^[0-9]{4}$')) {
			ctx.reply(`Please input the correct format!`);
		} else {
			ctx.scene.session.time = ctx.message.text;
			ctx.reply('What did he report sick for?');
			return ctx.wizard.next();
		}
	},
	(ctx) => {
		ctx.scene.session.reason = ctx.message.text;
		ctx.reply(
			'How long is his MC?',
			Markup.keyboard([['1', '2', '3', '4', '5', '6', '7', '8', '9']])
				.oneTime()
				.resize()
		);
		return ctx.wizard.next();
	},
	(ctx) => {
		if (isNaN(ctx.message.text)) {
			ctx.reply(`Please input a number!`);
		} else {
			ctx.scene.session.duration = ctx.message.text;
			ctx.reply(
				'Was there any medicine given?',
				Markup.inlineKeyboard([
					[Markup.button.callback('Yes', 'yes'), Markup.button.callback('No', 'no')],
				])
			);
		}
	},
	(ctx) => {
		ctx.scene.session.medicine = ctx.message.text;
		//https://github.com/esamattis/underscore.string If I want to be particular
		ctx.reply(
			'Was swab test administered?',
			Markup.keyboard(['Yes', 'No']).oneTime().resize()
		);
		return ctx.wizard.next();
	},
	async (ctx) => {
		mcEnd = moment()
			.add(ctx.scene.session.duration - 1, 'd')
			.format('DDMMYY');
		ctx.scene.session.swab = ctx.message.text == 'Yes' ? '' : ' not';
		let updateDate = mcEnd;
		let eSash = '';
		if (ctx.message.text == 'Yes') {
			ctx.replyWithHTML(
				`<b>Forward the next message and update DOO if you fall into any of the below criteria</b>\n\n1. Is Serviceman experiencing symptoms of ARI? (Cough, Sore Throat, Runny Nose\n\n2. Travelled out of SG?\n\n3. Close contact with confirmed case?\n\n4. Visited any foreign worker dormitories?\n\n5. Worked in high risk areas? (Community Care / Isolation Facilities)\n\n6. 4 or more  days of symptoms of ARI? (Cough, Sore Throat, Runny Nose) w/ fever?)`
			);
			updateDate = moment().add(1, 'd').format('DDMMYY');
			eSash = 'E-SASH has been filed.';
		}
		ctx.reply(
			`CAA ${date} by ${dooName}. At around ${ctx.scene.session.time}HRS, ${ctx.scene.session.nameNrank} ${ctx.scene.session.ic} from ${ctx.scene.session.battery} Battery reported sick at ${ctx.scene.session.location} for ${ctx.scene.session.reason}. He has gotten ATT C from ${date} to ${mcEnd} inclusive. ${ctx.scene.session.medicine} was dispensed. Swab test was${ctx.scene.session.swab} administered.\n\nDOO on ${updateDate} to follow up on updates.\n\n${eSash}\nCSDO has been informed.`,
			Markup.removeKeyboard()
		);
		return await ctx.scene.leave();
	}
)
	.action('inCamp', (ctx) => {
		ctx.scene.session.location = 'Khatib Medical Centre';
		ctx.reply('Enter masked NRIC.');
		return ctx.wizard.selectStep(4);
	})
	.action('outsideCamp', (ctx) => {
		ctx.reply('Where did he report sick at?');
		return ctx.wizard.next();
	})
	.action('no', (ctx) => {
		ctx.scene.session.medicine = 'No';
		ctx.reply(
			'Was swab test administered?',
			Markup.keyboard(['Yes', 'No']).oneTime().resize()
		);
		return ctx.wizard.selectStep(9);
	})
	.action('yes', (ctx) => {
		ctx.reply('What medicine was given?');
		return ctx.wizard.next();
	});

const stage = new Scenes.Stage([userWizard]);
stage.command('cancel', (ctx) => {
	ctx.reply('Operation canceled', Markup.removeKeyboard());
	return ctx.scene.leave();
});

bot.use(session());
bot.use(stage.middleware());
stage.register(userWizard);

bot.command('report', (ctx) => {
	ctx.scene.enter('user-wizard');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
