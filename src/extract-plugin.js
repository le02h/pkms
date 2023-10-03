const fs = require('fs')
const path = require('path')

function availableFilename (dstPath, name) {
  let filename = path.resolve(dstPath, name + '.tid')
  if (fs.existsSync(filename)) {
    for (let i = 1; i < 10; i++) {
      filename = path.resolve(dstPath, `${name}-${i}.tid`)
      if (!fs.existsSync(filename)) {
        return filename
      }
    }
  }
  return filename
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename))
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

function writeJson(filename, data) {
  fs.writeFile(filename, JSON.stringify(data, null, 2), function (err) {
    if (err) console.error(`Error writing ${filename}: ${err}`)
  })
}

function writePlginInfo(dstPath, meta) {
  const info = {}
  const exclude = ['created', 'modified', 'type', 'text']
  Object.keys(meta).forEach(key => {
    if (!exclude.includes(key)) {
      info[key] = meta[key]
    }
  })
  writeJson(path.join(dstPath, 'plugin.info'), info)
}

function writeTiddlers(dstPath, tiddlers) {
  Object.values(tiddlers).forEach(tiddler => {
    const name = path.basename(tiddler.title)

    let text = Object.keys(tiddler).map(k => {
      const v = tiddler[k]
      return k === 'text' ? '' : `${k}: ${v}`
    }).join('\n')
    text += `\n\n${tiddler.text}`

    const tid_filename = availableFilename(dstPath, name)
    fs.writeFile(tid_filename, text, function (err) {
      if (err) console.error(err)
    })
  })
}

function handler (argv) {
  const srcPath = path.resolve(__dirname, '../tmp/tiddlers')
  const dstPath = path.resolve(argv.targetPath)
  const data = readJson(path.resolve(srcPath, argv.pluginName) + '.json')

  if (data.tiddlers) {
    const meta = readTiddler(path.resolve(srcPath, argv.pluginName) + '.json.meta')
    writePluginInfo(dstPath, meta)
    writeTiddlers(dstPath, data.tiddlers)
  } else if (data[0] && data[0].title) {
    const tiddlers = JSON.parse(data[0].text).tiddlers
    writePlginInfo(dstPath, data[0])
    writeTiddlers(dstPath, tiddlers)
  }
}

module.exports = {
  command: 'extract-plugin <plugin-name> <target-path>',
  describe: 'extract plugin from JSON',
  builder: (yargs) => {
    yargs.positional('plugin-name', {
      describe: 'the plugin name',
      type: 'string'
    }).positional('target-path', {
      describe: 'the target path to save plugin',
      type: 'string'
    })
  },
  handler
}
