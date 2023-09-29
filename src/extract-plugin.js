const fs = require('fs')
const path = require('path')
const yargs = require('yargs/yargs')

function availableFilename (targetPath, name) {
  let filename = path.resolve(targetPath, name + '.tid')
  if (fs.existsSync(filename)) {
    for (let i = 1; i < 10; i++) {
      filename = path.resolve(targetPath, `${name}-${i}.tid`)
      if (!fs.existsSync(filename)) {
        return filename
      }
    }
  }
  return filename
}

const argv = yargs(process.argv.slice(2))
  .usage('Usage: $0 <plugin.json> <target-folder>')
  .command('$0 <plugin-json> <target-path>', 'extract plugin into folder',
    (yargs) => {
      yargs.positional('plugin-json', {
        describe: 'the plugin name',
        type: 'string'
      }).positional('target-path', {
        describe: 'the target path to save plugin',
        type: 'string'
      })
    },
    (argv) => {
      const filename = path.resolve(argv.pluginJson + '.meta')
      if (!fs.existsSync(filename)) {
        throw new Error(`Error: ${filename} not found.`)
      }

      const meta = {}
      const exclude = ['created', 'modified', 'type']
      fs.readFileSync(filename, 'utf-8').split('\n').forEach(line => {
        const m = /^(?<key>\w+):\s*(?<value>.+)/.exec(line.trim())
        if (m) {
          const { key, value } = m.groups
          if (key === 'dependents') {
            meta[key] = value.split(' ')
          } else if (exclude.indexOf(key) === -1) {
            meta[key] = value
          }
        }
      })
      fs.writeFile(path.resolve(argv.targetPath, 'plugin.info'), JSON.stringify(meta, null, 2), function (err) {
        if (err) {
          console.error(err)
          process.exit(-1)
        }
      })

      const data = JSON.parse(fs.readFileSync(argv.pluginJson))
      Object.values(data.tiddlers).forEach(tiddler => {
        const name = path.basename(tiddler.title)

        let text = Object.keys(tiddler).map(k => {
          const v = tiddler[k]
          return k === 'text' ? '' : `${k}: ${v}`
        }).join('\n')
        text += `\n\n${tiddler.text}`

        const fn = availableFilename(argv.targetPath, name)
        fs.writeFile(fn, text, function (err) {
          if (err) console.error(err)
        })
      })
    }).argv
