/**
 * GET /recipes/:recipe/tiddlers.json?filter=<filter>
 */
module.exports = function (router) {
  router.get('/recipes/:recipe/tiddlers.json', function (req, res) {
    const DEFAULT_FILTER = '[all[tiddlers]!is[system]sort[title]]'
    const $tw = req.$tw
    const tiddlerText = (tiddler) => $tw.wiki.getTiddlerText(tiddler)
    let filter = $tw.utils.decodeURIComponentSafe(req.query.filter) || DEFAULT_FILTER

    if (tiddlerText('$:/config/Server/AllowAllExternalFilters') !== 'yes') {
      if (tiddlerText(`$:/config/Server/ExternalFilters/${filter}`) !== 'yes') {
        const recipe = req.params.recipe
        console.log(`Blocked attempt to GET /recipes/${recipe}/tiddlers.json with filter: ${filter}`)
        res.sendStatus(403)
        return
      }
    }

    if (tiddlerText('$:/config/SyncSystemTiddlersFromServer') === 'no') {
      filter += '+[!is[system]]'
    }

    const excludeFields = (req.query.exclude || 'text').split(',')
    const titles = $tw.wiki.filterTiddlers(filter)
    const tiddlers = []

    $tw.utils.each(titles, function (title) {
      const tiddler = $tw.wiki.getTiddler(title)
      if (tiddler) {
        const fields = tiddler.getFieldStrings({ exclude: excludeFields })
        fields.revision = $tw.wiki.getChangeCount(title)
        fields.type = fields.type || 'text/vnd.tiddlywiki'
        tiddlers.push(fields)
      }
    })
    res.json(tiddlers)
  })
}
