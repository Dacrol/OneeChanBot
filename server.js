require('dotenv').config()

const OneeChan = require('./oneechan')

const commandPrefix = '!'
const ttsServer = 'http://localhost:5700/synth'
const soundsDir = './sounds/'
const thoughtsFile = './thoughts.json'

const bot = new OneeChan({commandPrefix, ttsServer, soundsDir, thoughtsFile})
bot.start(process.env.TOKEN)
