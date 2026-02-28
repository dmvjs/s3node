export default async (req) => {
  const page = await zap('demo/lib/page')
  const res = await fetch('http://api.open-notify.org/astros.json')
  const { people, number } = await res.json()

  const byCraft = people.reduce((acc, { name, craft }) => {
    acc[craft] = acc[craft] ?? []
    acc[craft].push(name)
    return acc
  }, {})

  const content = `
    <div class="row">
      <div class="value">${number}</div>
      <div class="label">People in space right now</div>
    </div>
    <div class="row">
      ${Object.entries(byCraft).map(([craft, names]) => `
        <div class="label" style="margin-bottom:0.75rem">${craft}</div>
        <div>${names.map(n => `<span class="tag">${n}</span>`).join('')}</div>
      `).join('<br>')}
    </div>
  `

  return page('Who\'s in space', content)
}
