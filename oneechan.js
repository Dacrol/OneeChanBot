const Discord = require('discord.js')
const { default: axios } = require('axios')
const mal = require('maljs')
const moment = require('moment')
require('moment-duration-format')

class OneeChan {
  constructor({ commandPrefix = '!' } = {}) {
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
    const { channel, author, content } = message
    const messageParts = commandRegex.exec(content)
    if (!Array.isArray(messageParts)) {
      console.error(`Invalid command "${content}" from ${author}`)
    }
    const [command, query] = messageParts.slice(1, 3)

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
          (animeInfo.pictures && animeInfo.pictures.length
            ? animeInfo.pictures[0]
            : '') +
          '\n' +
          animeInfo.description
        channel.send(`${response}`)
      },
      nextep: async () => {
        const show = await getShowDetails(query)
        if (show.external_ids.tvdb_id <= 0) {
          channel.send('No episode data found')
          return
        }
        const episodeData = await episodeDataFromTVMaze(
          'thetvdb',
          show.external_ids.tvdb_id
        )
        if (
          !(
            episodeData &&
            episodeData._embedded &&
            episodeData._embedded.nextepisode
          )
        ) {
          channel.send('No episode data found')
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
          .utcOffset(1)
          .format('dddd, MMMM Do, h:mm a')} (in ${moment
          .duration(time.diff(moment()))
          .format('d [days], h [hours], m [minutes]')}).`
        channel.send(response)
        return
      }
    }

    if (typeof commands[command] === 'function') {
      commands[command]()
    }
  }
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
    throw new Error('No hits. Sorry!')
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
      console.log(res)
      return axios
        .get(
          res.headers.location + '?embed[]=nextepisode&embed[]=previousepisode'
        )
        .then(res => res.data)
    })
    .catch(() => null)
  return Object.assign({}, showDetails)
}

module.exports = OneeChan
