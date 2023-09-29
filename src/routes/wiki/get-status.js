/**
 * GET /status
 */
module.exports = function (router) {
  router.get('/status', function (req, res) {
    const $tw = req.$tw
    res.json({
      username: '',
      anonymous: true,
      read_only: false,
      logout_is_available: false,
      space: {
        recipe: 'default'
      },
      tiddlywiki_version: $tw.version
    })
  })
}
