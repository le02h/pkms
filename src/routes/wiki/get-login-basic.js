/**
 *
 * GET /login-basic
 */
module.exports = function (router) {
  router.get('/login-basic', function (req, res) {
    res.sendStatus(403)
  })
}
