const express = require('express')

/**
 * PUT /recipes/:recipe/tiddlers/:title
 */
module.exports = function (router) {
  router.use('/recipes/:recipe/tiddlers/:title', express.json())
  router.put('/recipes/:recipe/tiddlers/:title', function (req, res) {
    const $tw = req.$tw
    const title = $tw.utils.decodeURIComponentSafe(req.params.title)
    const fields = { ...req.body }
    if (fields.fields) {
      $tw.utils.each(fields.fields, function (value, name) {
        fields[name] = value
      })
      delete fields.fields
    }

    if (fields.revision) {
      delete fields.revision
    }

    // If this is a skinny tiddler, it means the client never got the full
    // version of the tiddler to edit. So we must preserve whatever text
    // already exists on the server, or else we'll inadvertently delete it.
    if (fields._is_skinny) {
      const tiddler = $tw.wiki.getTiddler(title)
      if (tiddler) {
        fields.text = tiddler.fields.text
      }
      delete fields._is_skinny
    }
    $tw.wiki.addTiddler(new $tw.Tiddler(fields, { title }))

    const revision = $tw.wiki.getChangeCount(title)
    const encodedTitle = encodeURIComponent(title)
    res.set('ETag', `"${req.params.recipe}/${encodedTitle}/${revision}:"`)
    res.set('Content-Type', 'text/plain')
    res.status(204).send('OK')
  })
}
