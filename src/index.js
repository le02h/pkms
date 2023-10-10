#!/usr/bin/env node

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

const cli = yargs(hideBin(process.argv))

cli.usage('Usage: tw5-srv <command> [options]')
  .strict()
  .alias('h', 'help')
  .demandCommand()
  .wrap(cli.terminalWidth())
  .scriptName('tw5-srv')
  .command(require('./serve'))
  .command(require('./extract-plugin'))
  .command(require('./trim-html'))
  .parse()
