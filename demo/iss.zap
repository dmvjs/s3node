export default async (req) => {
  const page = await zap('demo/lib/page')
  const res = await fetch('http://api.open-notify.org/iss-now.json')
  const { iss_position: { latitude, longitude }, timestamp } = await res.json()

  const lat = parseFloat(latitude).toFixed(4)
  const lon = parseFloat(longitude).toFixed(4)
  const time = new Date(timestamp * 1000).toUTCString()
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'

  return page('ISS — live position', `
    <div class="row">
      <div class="value">${Math.abs(lat)}° ${ns}</div>
      <div class="label">Latitude</div>
    </div>
    <div class="row">
      <div class="value">${Math.abs(lon)}° ${ew}</div>
      <div class="label">Longitude</div>
    </div>
    <div class="row">
      <div class="value" style="font-size:1rem;color:#555">${time}</div>
      <div class="label">Timestamp</div>
    </div>
  `)
}
