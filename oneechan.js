const Discord = require('discord.js')
const { default: axios } = require('axios')
const mal = require('maljs')
const moment = require('moment')
require('moment-duration-format')
const crypto = require('crypto')
const fs = require('fs')
const ytdl = require('ytdl-core')

const timeOffset = 2

class OneeChan {
  constructor({ commandPrefix = '!', ttsServer = '', soundsDir = './sounds/', thoughtsFile = './thoughts.json'} = {}) {
    this.commandPrefix = commandPrefix
    this.ttsServer = ttsServer
    this.ttsBusy = false
    this.soundsDir = soundsDir
    this.thoughts = JSON.parse(fs.readFileSync(thoughtsFile, 'UTF8'))

    this.client = new Discord.Client()
    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user.tag}!`)
      this.client.user.setActivity('over you', { type: 'WATCHING' })
    })
    this.client.on('message', message => {
      if (!message.content.startsWith(this.commandPrefix) && !(message.mentions.has(this.client.user) && !message.mentions.everyone) || message.author.bot) {
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
    const { channel, author, content, member } = message
    const messageParts = commandRegex.exec(content)
    if (!Array.isArray(messageParts)) {
      console.error(`Invalid command "${content}" from ${author}`)
    } else {
      try {
        console.log(`Message "${content}" from "${author.username}" in channel "${channel.name || 'private message'}" in guild "${message.guild ? message.guild.name : 'private message'}"`)
      } catch (error) {
        console.log('Error logging message: ', error.message)
      }
      var [command, query] = messageParts.slice(1, 3)
    }

    const commands = {
      anime: async () => {
        const results = await mal.quickSearch(query)
        if (!(results.anime && results.anime.length)) {
          channel.send(
            `You asked about ${query}, ${
              author.username
            }-kun. Sadly no matches were found.`
          )
          return
        }
        const animeInfo = await results.anime[0].fetch()
        let response =
          '**__' +
          animeInfo.title +
          '__**' +
          '\n' +
          'Score: ' +
          animeInfo.score +
          '\n' +
          ((animeInfo.english && animeInfo.english !== animeInfo.title) ? ('English title: ' + animeInfo.english + '\n') : '') +
          (animeInfo.synonyms ? ('Synonyms: ' + animeInfo.synonyms + '\n') : '') +
          'More info: <' +
          animeInfo.mal.url +
          animeInfo.path +
          '>' +
          '\n\n' +
          (animeInfo.pictures && animeInfo.pictures.length
            ? animeInfo.pictures[0]
            : '') +
          '\n' +
          animeInfo.description.replace('[Written by MAL Rewrite]', '') +
          '\n'
        channel.send(`${response}`)
      },
      nextep: async () => {
        try {
          var episodeData = await getEpisodeData(query)
        } catch (error) {
          channel.send(error.message)
          return
        }
        if (!(episodeData && episodeData._embedded && episodeData._embedded.nextepisode && episodeData._embedded.nextepisode.airstamp)) {
          channel.send(
            `You asked about ${query}, ${
              author.username
            }-kun. Unfortunately no future episode was found.`
          )
          return
        }
        let nextEp = episodeData._embedded.nextepisode
        let time = moment(nextEp.airstamp)
        let response = `The next episode of ${
          episodeData.name
        } is episode number ${nextEp.number},${
          nextEp.name.length < 1 || nextEp.name.startsWith('Episode')
            ? ''
            : ' "' + nextEp.name + '",'
        } which airs on ${time
          .utcOffset(timeOffset)
          .format('dddd, MMMM Do, h:mm a')} (in ${moment
          .duration(time.diff(moment()))
          .format('d [days], h [hours], m [minutes]')}).`
        channel.send(response)
        return
      },
      lastep: async () => {
        try {
          var episodeData = await getEpisodeData(query)
        } catch (error) {
          channel.send(error.message)
          return
        }
        if (!(episodeData && episodeData._embedded && episodeData._embedded.previousepisode && episodeData._embedded.previousepisode.airstamp)) {
          channel.send(
            `You asked about ${query}, ${
              author.username
            }-kun. Unfortunately no previous episode was found.`
          )
          return
        }
        let lastEp = episodeData._embedded.previousepisode
        let time = moment(lastEp.airstamp)
        let response = `The last episode of ${
          episodeData.name
        } was episode number ${lastEp.number},${
          lastEp.name.length < 1 || lastEp.name.startsWith('Episode')
            ? ''
            : ' "' + lastEp.name + '",'
        } which aired on ${time
          .utcOffset(timeOffset)
          .format('dddd, MMMM Do YYYY, h:mm a')} (${moment
          .duration(moment().diff(time))
          .format('d [days], h [hours], m [minutes]')} ago).`
        channel.send(response)
        return
      },
      ara: async () => {
        this.joinMemberChannelAndPlay(member, 'ara.ogg')
      },
      ttstimer: async () => {
        let unbatched = true
        const queryParts = query.split(' ')
        const totalTime = +queryParts[0]
        const alertTimes = queryParts.slice(1)
        if ((totalTime - +alertTimes[0]) < 2) {
          unbatched = false
        }
        const timeObjects = alertTimes.map(time => {
          let voiceStr
          if (time == '1') {
            voiceStr = time + ' minute remaining.'
          } else {
            voiceStr = time + ' minutes remaining.'
          }
          return { text: voiceStr, unbatched: unbatched, time: time }
        })
        let notifiedGenerate = false
        this.prepareTtsFiles(timeObjects, () => {
          if (!notifiedGenerate) {
            channel.send('Synthesizing new voice files...')
            notifiedGenerate = true
          }
        }).then(() => {
          if (notifiedGenerate) {
            channel.send('Voice files have been synthesized!')
          }
        })
        timeObjects.forEach(obj => {
          setTimeout(() => {
            this.playOrGenerateTts(obj.text, member, obj.unbatched, false)
          }, (totalTime - +obj.time) * 60 * 1000)
        })
      },
      speak: async () => {
        this.playOrGenerateTts(query, member)
      },
      uspeak: async () => {
        this.playOrGenerateTts(query, member, true)
      },
      ytplay: async () => {
        const queryParts = query.split(' ')
        const yt = queryParts[0].startsWith('http') ? queryParts[0] : 'https://www.youtube.com/watch?v=' + queryParts[0]
        const stream = ytdl(yt, { filter : 'audioonly', highWaterMark: 2**25 })
        this.joinMemberChannelAndPlay(member, stream, {type: 'stream', options: { volume: +(queryParts[1] || 0.1) }})
      },
      play: () => {
        const [link, volume] = query.split(' ')
        axios.get(link, { responseType: 'stream' }).then(async res => {
          this.joinMemberChannelAndPlay(member, res.data, { type: 'stream', options: { volume: +(volume || 0.1) } })
        })
      },
      hek: async () => {
        this.joinMemberChannelAndPlay(member, 'VayHekPhase2Start.ogg')
      },
      tftd: async () => {
        channel.send('Thought for the Day: ' + this.thoughts[Math.floor(Math.random() * this.thoughts.length)])
      }
    }

    if (typeof commands[command] === 'function') {
      commands[command]()
      return
    }
    if (message.mentions.has(this.client.user) && !content.startsWith('!')) {
      channel.send('Available commands: !' + Object.keys(commands).join(', !'))
      return
    }
  }

  async prepareTtsFiles(textObjects = [], onGenerate = () => {}) {
    for (const obj of textObjects) {
      const file = getFileName(obj.text, obj.unbatched)
      if (!fs.existsSync(this.soundsDir + file)) {
        onGenerate()
        await axios.post(this.ttsServer, obj.unbatched ? {text: obj.text, unbatched: 'true'} : {text: obj.text}, {responseType: 'stream'}).then(async res => {
          await res.data.pipe(fs.createWriteStream(this.soundsDir + file))
        })
      }
    }
    console.log('TTS files have been prepared')
  }

  async playOrGenerateTts(text, member, unbatched = false, generate = true) {
    const file = getFileName(text, unbatched)
    if (fs.existsSync(this.soundsDir + file)) {
      this.joinMemberChannelAndPlay(member, file, { type: 'file', options: { volume: 0.75 } })
    } else if (generate) {
      await this.generateTts(text, file, true)
      this.joinMemberChannelAndPlay(member, file, { type: 'file', options: { volume: 0.75 } })
    } else {
      console.log('Did not find pre-generated file: ' + file)
    }
  }

  generateTts(text, file, unbatched = false) {
    return axios.post(this.ttsServer, unbatched ? {text: text, unbatched: 'true'} : {text: text}, {responseType: 'stream'}).then(async res => {
      await res.data.pipe(fs.createWriteStream(this.soundsDir + file))
      return file
    })
  }

  async joinMemberChannelAndPlay(member, target, {type = 'file', options = { volume: 0.5 }} = {}) {
    const channel = (member.voice && member.voice.channel) || member.voiceChannel
    if (
      !channel ||
      !channel.name ||
      channel.name.toLowerCase().includes('afk')
    ) {
      return
    }
    if (type === 'file') {
      target = this.soundsDir + target
    }
    channel
      .join()
      .then(voiceConnection => {
        // const stream = fs.createReadStream(target)
        // const dispatcher = voiceConnection.play(stream, {
        //   volume: 0.5
        // })
        const dispatcher = voiceConnection.play(target, options)
        dispatcher.on('end', end => {
          channel.leave()
        })
      })
      .catch(err => {
        console.error(err)
        channel.leave()
      })
  }
}

async function getEpisodeData(query) {
  const show = await getShowDetails(query)
  let episodeData
  if (show.external_ids.tvdb_id > 0) {
    episodeData = await episodeDataFromTVMaze(
      'thetvdb',
      show.external_ids.tvdb_id
    )
  }
  if (!(episodeData && episodeData._embedded)) {
    episodeData = await axios
      .get(
        'http://api.tvmaze.com/singlesearch/shows?q=' +
          query +
          '&embed[]=nextepisode&embed[]=previousepisode'
      )
      .then(res => res.data)
      .catch(() => {})
  }
  if (!(episodeData && episodeData._embedded)) {
    throw new Error('No episode data found.')
  }
  return episodeData
}

/**
 * Gets details on a show. Only the first hit is returned.
 * Also gets the IDs for the same show on other APIs known to TMDB
 *
 * @param {string} query
 * @param {string} [tmdbToken=null]
 * @returns {Promise<Object>}
 */
async function getShowDetails(query, tmdbToken = null) {
  if (!(tmdbToken = tmdbToken || process.env.TMDB_TOKEN)) {
    throw new Error('No API token supplied')
  }

  let json = await axios
    .get(
      `http://api.themoviedb.org/3/search/tv?api_key=${tmdbToken}&query=${query}`
    )
    .then(res => res.data)

  if (!json.total_results) {
    throw new Error('No matching shows found. Sorry!')
  } else {
    try {
      const show = json.results[0]
      json = await axios
        .get(
          `http://api.themoviedb.org/3/tv/${
            show.id
          }?api_key=${tmdbToken}&append_to_response=external_ids`
        )
        .then(res => res.data)
      return json
    } catch (e) {
      throw new Error('No match, sorry!')
    }
  }
}

/**
 * Gets data & episode info from TVMaze
 *
 * @param {string} externalProvider
 * @param {number|string} externalID
 * @returns {Promise<Object>}
 */
async function episodeDataFromTVMaze(externalProvider, externalID) {
  const showDetails = await axios
    .get(
      'http://api.tvmaze.com/lookup/shows?' +
        externalProvider +
        '=' +
        externalID,
      {
        maxRedirects: 0,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        validateStatus: function(status) {
          return status >= 200 && status <= 302
        }
      }
    )
    .then(res => {
      return axios
        .get(
          res.headers.location + '?embed[]=nextepisode&embed[]=previousepisode'
        )
        .then(res => res.data)
    })
    .catch(() => null)
  return Object.assign({}, showDetails)
}

function md5(str) {
  return crypto
    .createHash('md5')
    .update(str)
    .digest('hex')
}

function getFileName(text, unbatched) {
  let file = (unbatched ? 'u_' : '') + md5(text) + '.wav'
  return file
}

module.exports = OneeChan
