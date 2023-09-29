/**
 * GET /recipes/:recipe/tiddlers/:title
 */
module.exports = function (router) {
  router.get('/recipes/:recipe/tiddlers/:title', function (req, res) {
    const $tw = req.$tw
    const title = $tw.utils.decodeURIComponentSafe(req.params.title)
    const tiddler = $tw.wiki.getTiddler(title)
    const knownFields = [
      'bag', 'created', 'creator', 'modified', 'modifier', 'permissions',
      'recipe', 'revision', 'tags', 'text', 'title', 'type', 'uri'
    ]
    const tiddlerFields = {}

    if (tiddler) {
      $tw.utils.each(tiddler.fields, function (field, name) {
        const value = tiddler.getFieldString(name)
        if (knownFields.indexOf(name) !== -1) {
          tiddlerFields[name] = value
        } else {
          tiddlerFields.fields = tiddlerFields.fields || {}
          tiddlerFields.fields[name] = value
        }
      })
      tiddlerFields.revision = $tw.wiki.getChangeCount(title)
      tiddlerFields.bag = 'default'
      tiddlerFields.type = tiddlerFields.type || 'text/vnd.tiddlywiki'
      res.json(tiddlerFields)
    } else {
      res.sendStatus(404)
    }
  })
}
