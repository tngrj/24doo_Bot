require('dotenv').config();
const { Telegraf, Markup, Stage, session, Scenes } = require('telegraf');
const express = require('express');

//Initializing Bot
const bot = new Telegraf(process.env.TOKEN);

// Initialise Express
const app = express();
bot.telegram.setWebhook(`${process.env.HEROKU_URL}${process.env.API_TOKEN}`);
app.use(bot.webhookCallback(`${process.env.API_TOKEN}`));

app.listen(process.env.PORT || 3000, () => {
	console.log(`24 DOO Bot listening on port ${process.env.PORT}!`);
});

// Date Generation for other modules
let newDate = new Date();
let monthNames = newDate.toLocaleString('default', { month: 'long' });
const dtf = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Asia/Singapore',
	year: '2-digit',
	month: '2-digit',
	day: '2-digit',
});
let [{ value: day }, , { value: month }, , { value: year }] = dtf.formatToParts(newDate);
const date = `${day}${month}${year}`;

bot.command('start', (ctx) => {
	ctx.replyWithHTML(
		`Welcome to <b>24 SA DOO Reporting Bot</b>. Do /report to start a report to send to the DOO`
	);
});

//Allows DOO to set their name
let dooName = '[DOO NAME]';
bot.hears(/^\/doo (.*)$/, (ctx) => {
	dooName = ctx.match[1];
	if (dooName === undefined) {
		ctx.reply('Pleae key in a name!');
		return;
	}
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
		ctx.scene.session.time = ctx.message.text;
		ctx.reply('What did he report sick for?');
		return ctx.wizard.next();
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
			ctx.reply('What medicine did he get?');
			return ctx.wizard.next();
		}
	},
	(ctx) => {
		ctx.scene.session.medicine = ctx.message.text;
		ctx.reply(
			'Was swab test administered?',
			Markup.keyboard(['Yes', 'No']).oneTime().resize()
		);
		return ctx.wizard.next();
	},
	async (ctx) => {
		let time = ctx.scene.session.duration - 1;
		let mcEnd = new Date(Date.now() + time * 24 * 60 * 60 * 1000);
		const [{ value: day }, , { value: month }, , { value: year }] = dtf.formatToParts(
			mcEnd
		);
		mcEnd = `${day}${month}${year}`;
		ctx.scene.session.swab = ctx.message.text == 'Yes' ? '' : ' not';
		ctx.reply(
			`CAA ${date} by ${dooName}. At around ${ctx.scene.session.time}HRS, ${ctx.scene.session.nameNrank} ${ctx.scene.session.ic} from ${ctx.scene.session.battery} Battery reported sick at ${ctx.scene.session.location} for ${ctx.scene.session.reason}. He has gotten ATT C from ${date} to ${mcEnd} inclusive. ${ctx.scene.session.medicine} was dispensed. Swab test was${ctx.scene.session.swab} administered.`,
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
