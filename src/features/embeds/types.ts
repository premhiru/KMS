import type { EventEmbedDefinition } from '../../domain'

export type EmbedFormat = EventEmbedDefinition['format']
export type EmbedDefinition = EventEmbedDefinition

export const embedFields = ['description', 'dateTime', 'room', 'speakers', 'format', 'track'] as const

export function buildEmbedUrl(baseUrl: string, embed: EmbedDefinition): string {
  const url = new URL(baseUrl)
  url.searchParams.set('embed', embed.id)
  url.searchParams.set('enabled', embed.enabled ? '1' : '0')
  if (embed.format !== 'styled-html') url.searchParams.set('output', embed.format)
  if (embed.accentColor) url.searchParams.set('accent', embed.accentColor)
  if (embed.backgroundColor) url.searchParams.set('background', embed.backgroundColor)
  if (embed.track) url.searchParams.set('track', embed.track)
  if (embed.sessionFormat) url.searchParams.set('sessionFormat', embed.sessionFormat)
  if (embed.room) url.searchParams.set('room', embed.room)
  url.searchParams.set('fields', embed.visibleFields.join(','))
  url.hash = `/event/${embed.type}`
  return url.toString()
}

export function embedCode(baseUrl: string, eventName: string, embed: EmbedDefinition, height = 720): string {
  const url = buildEmbedUrl(baseUrl, embed)
  if (embed.format === 'json' || embed.format === 'xml' || embed.format === 'ical') return url
  const className = embed.format === 'basic-html' ? ' class="openspeaker-embed openspeaker-embed--basic"' : ' class="openspeaker-embed"'
  return `<iframe${className} src="${url}" title="${eventName} ${embed.name}" width="100%" height="${height}" style="border:0" loading="lazy"></iframe>`
}

export function loadEmbeds(storage: Pick<Storage, 'getItem'>, eventId: string): EmbedDefinition[] {
  try {
    const value = JSON.parse(storage.getItem(`openspeaker:embeds:${eventId}`) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is EmbedDefinition => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string')) : []
  } catch { return [] }
}

export function saveEmbeds(storage: Pick<Storage, 'setItem'>, eventId: string, embeds: EmbedDefinition[]) {
  storage.setItem(`openspeaker:embeds:${eventId}`, JSON.stringify(embeds))
}
