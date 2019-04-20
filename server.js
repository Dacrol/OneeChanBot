require('dotenv').config()

const OneeChan = require('./oneechan')

const commandPrefix = '!'

const bot = new OneeChan({commandPrefix})
bot.start(process.env.TOKEN)