/**
 * GET /:title
 */
module.exports = function (router) {
  router.get('/:title', function (req, res) {
    const $tw = req.$tw
    const title = $tw.utils.decodeURIComponentSafe(req.params.title)
    const tiddler = $tw.wiki.getTiddler(title)
    if (tiddler) {
      let renderType = tiddler.getFieldString('_render_type')
      let renderTemplate = tiddler.getFieldString('_render_template')

      // Tiddler fields '_render_type' and '_render_template' overwrite
      // system wide settings for render type and template
      if ($tw.wiki.isSystemTiddler(title)) {
        renderType = renderType || req.settings.get('system-tiddler-render-type')
        renderTemplate = renderTemplate || req.settings.get('system-tiddler-render-template')
      } else {
        renderType = renderType || req.settings.get('tiddler-render-type')
        renderTemplate = renderTemplate || req.settings.get('tiddler-render-template')
      }

      const text = $tw.wiki.renderTiddler(renderType, renderTemplate, {
        parseAsInline: true,
        variables: {
          currentTiddler: title
        }
      })
      res.set('Content-Type', 'text/html')
      res.send(text)
    } else {
      res.sendStatus(404)
    }
  })
}
