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
  if (fields.text) {
    fields.text = fields.text.trim()
  }
  return fields
}

/**
 * 
 * @param {String} dstPath 
 * @param {String} title 
 * @param {Object} meta 
 */
function tiddlerFilePath(dstPath, title, meta) {
  let filename
  if (title.indexOf(meta.prefix) === 0) {
    filename = title.substr(meta.prefix.length)
  } else {
    filename = title.replace('$:/', '')
  }
  if (filename[0] === '/') {
    filename = filename.substr(1)
  }

  filename = filename.replaceAll('/', '_')
  return path.join(dstPath, filename + '.tid')
}

function writeTiddlers(dstPath, tiddlers, meta) {
  Object.values(tiddlers).forEach(fields => {
    let content = ''
    Object.keys(fields).forEach(key => {
      if (key !== 'text') {
        content += `${key}: ${fields[key]}\n`
      }
    })
    content = `${content}\n${fields.text}`

    const filePath = tiddlerFilePath(dstPath, fields.title, meta)
    fs.writeFile(filePath, content, (err) => {
      const filename = path.basename(filePath)
      if (err) {
        console.log(`Error: write ${filename} failed: ${err}`)
        process.exit(-2)
      }
      console.log(`>>> write ${filename} done`)
    })
  })
}

function writePluginInfo(dstPath, meta) {
  const knownFields = [
    'title', 'name', 'plugin-type', 'core-version', 'author',
    'description', 'dependents', 'version'
  ]
  let content = ''
  knownFields.forEach((key) => {
    if (meta[key]) {
      const prefix = content === '' ? '  ' : ', '
      content += `${prefix}"${key}": ${JSON.stringify(meta[key])}\n`
    }
  })
  content = `{\n${content}}`
  const filePath = path.join(dstPath, 'plugin.info')
  fs.writeFile(filePath, content, (err) => {
    if (err) {
      console.log(`Error: write plugin.info failed: ${err}`)
      process.exit(-1)
    }
    console.log(`>>> write plugin.info in ${dstPath} done`)
  })
}

function handler (argv) {
  const srcPath = path.resolve(__dirname, '../exp/tiddlers')
  const dstPath = path.resolve(argv.pluginPath)
  const data = readJson(path.resolve(srcPath, argv.pluginName) + '.json')
  let meta, tiddlers

  if (data.tiddlers) {
    tiddlers = data.tiddlers
    meta = readTiddler(path.resolve(srcPath, argv.pluginName) + '.json.meta')
  } else {
    tiddlers = JSON.parse(data[0].text).tiddlers
    meta = data[0]
  }
  meta.prefix = argv.pluginPrefix || meta.title
  writePluginInfo(dstPath, meta)
  writeTiddlers(dstPath, tiddlers, meta)
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
    }).option('plugin-prefix', {
      type: 'string',
      describe: 'the prefix for plugin title'
    })
  },
  handler
}
