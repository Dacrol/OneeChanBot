require('dotenv').config()

const OneeChan = require('./oneechan')

const commandPrefix = '!'
const ttsServer = 'http://localhost:5700/synth'
const soundsDir = './sounds/'

const bot = new OneeChan({commandPrefix, ttsServer, soundsDir})
bot.start(process.env.TOKEN)
