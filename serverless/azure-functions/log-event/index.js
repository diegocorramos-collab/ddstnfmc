// Azure Functions v4 (Node 18+)
module.exports = async function (context, req) {
  try {
    if (req.method !== 'POST') {
      context.res = { status: 405, body: { error: 'Method Not Allowed' } };
      return;
    }
    const body = req.body || {};
    if (!body.action) {
      context.res = { status: 400, body: { error: 'Missing action' } };
      return;
    }
    context.log('DDS-LogEvent', body);
    context.res = { status: 200, body: { ok: true } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: 'Internal error' } };
  }
};
