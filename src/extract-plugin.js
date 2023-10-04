const fs = require('fs')
const path = require('path')


function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function readTiddler(filename) {
  const fields = {}
  const text = fs.readFileSync(filename, 'utf-8')
  text.split('\n').forEach(line => {
    const m = /^(?<key>\w+):\s*(?<value>.+)/.exec(line.trim())
    if (m) {
      const { key, value } = m.groups
      if (key === 'dependents') {
        fields[key] = value.split(' ')
      } else {
        fields[key] = value
      }
    } else if (fields.text) {
      fields.text += '\n' + line
    } else if (line.trim() === '') {
      fields.text = '\n'
    }
  })
  return {
    ...fields,
    text: fields.text.trim()
  }
}

/**
 * 
 * @param {String} dstPath 
 * @param {String} title 
 * @param {Object} meta 
 */
function tiddlerFileName(dstPath, title, meta) {
  let filename
  if (title.indexOf(meta.title) === 0) {
    filename = title.from(meta.title.length)

  } else {
    filename = title.replace('$:/', '')
  }
  filename = filename.replace('/', '_')
  return path.join(dstPath, filename + '.tid')
}

function writeTiddlers(dstPath, tiddlers, meta) {
  Object.values(tiddlers).forEach(fields => {
    let content = Object.entries(fields).map(([k, v]) => k === 'text' ? '' : `${k}: ${v}`).join('\n')
    content = `${content}\n\n${tiddler.text}`

    const filePath = tiddlerFilePath(dstPath, fields.title, meta)
    fs.writeFileSync(filePath, content)
  })
}

function writePlginInfo(dstPath, meta) {
  const knownFields = []
  const info = {}
  const exclude = ['created', 'modified', 'type', 'text']
  Object.keys(meta).forEach(key => {
    if (!exclude.includes(key)) {
      info[key] = meta[key]
    }
  })
  const filePath = path.join(dstPath, 'plugin.info')
  fs.writeFileSync(filePath, JSON.stringify(info, null, 2))
}

function handler (argv) {
  const srcPath = path.resolve(__dirname, '../exp/tiddlers')
  const dstPath = path.resolve(argv.pluginPath)
  const data = readJson(path.resolve(srcPath, argv.pluginName) + '.json')

  if (data.tiddlers) {
    const meta = readTiddler(path.resolve(srcPath, argv.pluginName) + '.json.meta')
    writePluginInfo(dstPath, meta)
    writeTiddlers(dstPath, data.tiddlers, meta)
  } else {
    const tiddlers = JSON.parse(data[0].text).tiddlers
    writePlginInfo(dstPath, data[0])
    writeTiddlers(dstPath, tiddlers, data[0])
  }
}

module.exports = {
  command: 'extract-plugin <plugin-name> <plugin-path>',
  describe: 'extract plugin from JSON',
  builder: (yargs) => {
    yargs.positional('plugin-name', {
      describe: 'the plugin name',
      type: 'string'
    }).positional('plugin-path', {
      describe: 'the target path to save plugin',
      type: 'string'
    })
  },
  handler
}
