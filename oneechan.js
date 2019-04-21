
const Discord = require('discord.js')
const axios = require('axios')
const mal = require('maljs')

class OneeChan {
  constructor({commandPrefix = '!'} = {}) {
    this.commandPrefix = commandPrefix
    this.client = new Discord.Client()
    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user.tag}!`)
      this.client.user.setActivity('over you', { type: 'WATCHING' })
    })
    this.client.on('message', message => {
      if (!message.content.startsWith(this.commandPrefix)) {
        return
      }
      this.handleCommand(message)
    })
  }

  start(token) {
    this.client.login(token)
  }

  handleCommand(message) {
    const commandRegex = new RegExp(`^\\${this.commandPrefix}(\\S+)\\s*(.*)$`)
    const {channel, author, content} = message
    const messageParts = commandRegex.exec(content)
    if (!Array.isArray(messageParts)) {
      console.error(`Invalid command "${content}" from ${author}`)
    }
    const [command, query] = messageParts.slice(1, 3)

    const commands = {
      anime: async () => {
        const results = await mal.quickSearch(query)
        if (!(results.anime && results.anime.length)) {
          channel.send(`You asked about ${query}, ${author.username}-kun. Sadly no matches were found.`)
          return
        }
        const animeInfo = await results.anime[0].fetch()
        let response = ((animeInfo.pictures && animeInfo.pictures.length) ? animeInfo.pictures[0] : '')  + '\n' + animeInfo.description
        channel.send(`${response}`)
      }
    }

    if (typeof commands[command] === 'function') {
      commands[command]()
    }
  }
}

module.exports = OneeChan
