require('dotenv').config();
const { Telegraf, Markup, Stage, session, Scenes } = require('telegraf');
const express = require('express');
const admin = require('firebase-admin');
const moment = require('moment');

// Initializing Bot
const bot = new Telegraf(process.env.TOKEN);

// Initialize Firebase Admin
admin.initializeApp({
	credential: admin.credential.cert({
		projectId: process.env.PROJECT_ID,
		private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
		client_email: process.env.CLIENT_EMAIL,
	}),
	databaseURL: process.env.DATABASE_URL,
});

let db = admin.database().ref('dooReport/');

// Initialise Express
const app = express();
bot.telegram.setWebhook(`${process.env.HEROKU_URL}${process.env.API_TOKEN}`);
app.use(bot.webhookCallback(`${process.env.API_TOKEN}`));

app.listen(process.env.PORT || 3000, () => {
	console.log(`24 DOO Bot listening on port ${process.env.PORT}!`);
});

// Date Generation
let date = moment().format('DDMMYY');

bot.command('start', (ctx) => {
	ctx.replyWithHTML(
		`Welcome to <b>24 SA DOO Reporting Bot</b>. Do /report to start a report to send to the DOO`
	);
});

// Allows DOO to set their name

// This was to initially generate the branch for us to read the doo name
// bot.command('generate', (ctx) => {
// 	Placeholder = '[DOO NAME]';
// 	db.set({
// 		dooName: Placeholder,
// 	});
// });

let dooName;

db.once('value', (x) => {
	dooName = x.val().dooName;
});

bot.hears(/^\/doo (.*)$/, (ctx) => {
	dooName = ctx.match[1].toUpperCase();
	if (dooName === undefined) {
		ctx.reply('Pleae key in a name!');
		return;
	}
	db.update({
		dooName: dooName,
	});
	ctx.reply(`Today's DOO is ${dooName}.`);
});

bot.command('today', (ctx) => {
	ctx.reply(`Today's DOO is ${dooName}.`);
});

// Generates a template to send to the DOO when people report sick
let dooMessage;
const userWizard = new Scenes.WizardScene(
	'user-wizard',
	(ctx) => {
		ctx.replyWithHTML(
			`Use /cancel at any stage to get out of reporting.\n\nEnter the <b>rank and name</b> that reported sick.`
		);
		return ctx.wizard.next();
	},
	(ctx) => {
		ctx.scene.session.userId = ctx.from.id;
		ctx.scene.session.username = ctx.from.username;
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
		ctx.reply('Enter masked NRIC. (SXXXX123A)');
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
			await ctx.replyWithHTML(
				`<b>Do also update DOO if you fall into any of the below criteria</b>\n\n1. Did you travel overseas in the past 14 days?\n\n2. Did you make contact with a confirmed COVID-19 infected case?\n\n3. Did you stay in a foreign worker domitory?\n\n4. Do you work in an environment with higher risk of exposure to COVID-19?\n\n5. Do you have any ARI symptoms, fever (37.5°C or above)?\n\n6. Any pneumonia diagnosis from the doctor?`
			);
			updateDate = moment().add(1, 'd').format('DDMMYY');
			eSash = '\nE-SASH has been filed.';
		}
		let asis = '';
		if (ctx.scene.session.duration > 3)
			asis = 'ASIS report has been made.\nIR Ref No.: 24 SA/2021/[REPORT NO]';
		dooMessage = ctx.reply(
			`CAA ${date} by ${dooName}. At around ${ctx.scene.session.time}HRS, ${ctx.scene.session.nameNrank}, ${ctx.scene.session.ic} from ${ctx.scene.session.battery} Battery reported sick at ${ctx.scene.session.location} for ${ctx.scene.session.reason}. He has gotten ${ctx.scene.session.duration} days ATT C from ${date} to ${mcEnd} inclusive. ${ctx.scene.session.medicine} was dispensed. Swab test was${ctx.scene.session.swab} administered.\n\nDOO on ${updateDate} to follow up on updates.\n${eSash}\nCDSO has been informed.\n${asis}`,
			Markup.inlineKeyboard([
				Markup.button.callback('Press this to send message to the DOO', 'sendDOO'),
			])
		);
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
	})
	.action('sendDOO', async (ctx) => {
		await ctx.forwardMessage(
			process.env.DOOPHONEID,
			process.env.REPORTBOTID,
			dooMessage.message_id
		);

		ctx.reply(
			'Report was sent to the DOO. Ensure DOO sends you an acknowledgement else call the DOO to update.',
			Markup.removeKeyboard()
		);

		ctx.telegram.sendMessage(
			process.env.DOOPHONEID,
			`This report was sent by [${ctx.scene.session.username}](tg://user?id=${ctx.scene.session.userId})\\. Do send a message back to acknowledge that you received the message\\.`,
			{ parse_mode: 'MarkdownV2' }
		);
		return ctx.scene.leave();
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
