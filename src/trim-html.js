const fs = require('fs')
const path = require('path')


module.exports = {
  command: 'trim-html <html-file>',
  describe: 'prettify the HTML body part',
  builder: (yargs) => {
    yargs.positional('html-file', {
      describe: 'the html file name',
      type: 'string'
    }).option('inplace', {
      aliases: ['i'],
      type: 'boolean',
      default: false
    })
  },
  handler: (args) => {
    let headLines = []
    let bodyLines = []
    let tail = ''
    const lines = fs.readFileSync(path.resolve(args.htmlFile), 'utf-8').split('\n')
    lines.forEach(line => {
      const t = line.trim()
      if (bodyLines.length === 0) {
        if (/^<body/.test(t)) {
          bodyLines.push(t)
        } else {
          headLines.push(line)
        }
      } else if (tail === '') {
        if (t === '</body>') {
          tail = t
        } else if (t !== '') {
          bodyLines.push(t)
        }
      } else {
        if (t !== '') {
          tail += t
        }
        if (t === '</html>') return true
      }
    })

    const content = headLines.join('\n') + bodyLines.join('\n') + tail
    fs.writeFile(args.htmlFile, content, (err) => {
      if (err) console.error(err)
    })
  }
}
