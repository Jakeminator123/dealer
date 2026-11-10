import {isCourt, isRed, RANK_NAME_SV, type PlayingCard, type Rank, type Suit} from '@/lib/deck'

/*
 * Every one of the 52 faces (and the branded back) is painted at runtime on a
 * 2D canvas and uploaded as a texture, so the deck ships as code, not images.
 */

export const TEX_W = 768
export const TEX_H = 1075
const CORNER = 56

const INK = '#0a0b0d'
const PAPER = '#f4f2ec'
const RED = '#e23b4a'
const LIME = '#d6ff3a'
const LIME_ON_PAPER = '#9fc41a'

export interface CardFonts {
    sans: string
    mono: string
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string }

/** Reads the next/font families off :root so canvas text matches the page. */
export function resolveCardFonts(): CardFonts {
    const styles = getComputedStyle(document.documentElement)
    const sans = styles.getPropertyValue('--font-inter').trim()
    const mono = styles.getPropertyValue('--font-geist-mono').trim()
    return {
        sans: [sans, 'Inter', '"Helvetica Neue"', 'Arial', 'sans-serif'].filter(Boolean).join(', '),
        mono: [mono, '"Geist Mono"', 'ui-monospace', 'Menlo', 'monospace'].filter(Boolean).join(', '),
    }
}

export async function ensureCardFontsLoaded(fonts: CardFonts) {
    if (!('fonts' in document)) return
    try {
        await Promise.all([
            document.fonts.load(`700 100px ${fonts.sans}`),
            document.fonts.load(`600 60px ${fonts.sans}`),
            document.fonts.load(`500 24px ${fonts.mono}`),
        ])
    } catch {
        /* fall back to system fonts, the card still renders */
    }
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
}

function setLetterSpacing(ctx: Ctx, value: string) {
    if ('letterSpacing' in ctx) ctx.letterSpacing = value
}

/* ---------- suit glyphs as vector paths (unit size s, centred on 0,0) ---------- */

function heartPath(s: number) {
    const p = new Path2D()
    const r = 0.26 * s
    const cx = 0.26 * s
    const cy = -0.16 * s
    p.moveTo(0, 0.5 * s)
    p.bezierCurveTo(-0.16 * s, 0.3 * s, -0.52 * s, 0.14 * s, -0.52 * s, cy)
    p.arc(-cx, cy, r, Math.PI, 0, false)
    p.arc(cx, cy, r, Math.PI, 0, false)
    p.bezierCurveTo(0.52 * s, 0.14 * s, 0.16 * s, 0.3 * s, 0, 0.5 * s)
    p.closePath()
    return p
}

function stem(p: Path2D, s: number, top: number) {
    p.moveTo(0.06 * s, top)
    p.bezierCurveTo(0.06 * s, 0.38 * s, 0.16 * s, 0.46 * s, 0.27 * s, 0.5 * s)
    p.lineTo(-0.27 * s, 0.5 * s)
    p.bezierCurveTo(-0.16 * s, 0.46 * s, -0.06 * s, 0.38 * s, -0.06 * s, top)
    p.closePath()
}

function spadePath(s: number) {
    const p = new Path2D()
    const r = 0.25 * s
    const cx = 0.25 * s
    const cy = 0.08 * s
    p.moveTo(0, -0.5 * s)
    p.bezierCurveTo(0.16 * s, -0.3 * s, 0.5 * s, -0.12 * s, 0.5 * s, cy)
    p.arc(cx, cy, r, 0, Math.PI, false)
    p.arc(-cx, cy, r, 0, Math.PI, false)
    p.bezierCurveTo(-0.5 * s, -0.12 * s, -0.16 * s, -0.3 * s, 0, -0.5 * s)
    p.closePath()
    stem(p, s, 0.2 * s)
    return p
}

function clubPath(s: number) {
    const p = new Path2D()
    const r = 0.2 * s
    const lobes: [number, number][] = [
        [0, -0.26 * s],
        [-0.23 * s, 0.08 * s],
        [0.23 * s, 0.08 * s],
    ]
    for (const [x, y] of lobes) {
        p.moveTo(x + r, y)
        p.arc(x, y, r, 0, Math.PI * 2)
    }
    p.moveTo(0, -0.2 * s)
    p.lineTo(0.15 * s, 0.12 * s)
    p.lineTo(-0.15 * s, 0.12 * s)
    p.closePath()
    stem(p, s, 0.1 * s)
    return p
}

function diamondPath(s: number) {
    const p = new Path2D()
    p.moveTo(0, -0.5 * s)
    p.quadraticCurveTo(0.2 * s, -0.2 * s, 0.38 * s, 0)
    p.quadraticCurveTo(0.2 * s, 0.2 * s, 0, 0.5 * s)
    p.quadraticCurveTo(-0.2 * s, 0.2 * s, -0.38 * s, 0)
    p.quadraticCurveTo(-0.2 * s, -0.2 * s, 0, -0.5 * s)
    p.closePath()
    return p
}

const SUIT_PATH: Record<Suit, (s: number) => Path2D> = {
    hearts: heartPath,
    spades: spadePath,
    clubs: clubPath,
    diamonds: diamondPath,
}

function drawSuit(ctx: Ctx, suit: Suit, x: number, y: number, size: number, rotation: number, color: string) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rotation)
    ctx.fillStyle = color
    ctx.fill(SUIT_PATH[suit](size))
    ctx.restore()
}

/* ---------- face ---------- */

const PIP_LAYOUTS: Partial<Record<Rank, [number, number][]>> = {
    '2': [[0, -1], [0, 1]],
    '3': [[0, -1], [0, 0], [0, 1]],
    '4': [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    '5': [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    '6': [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    '7': [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    '8': [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [0, 0.5], [-1, 1], [1, 1]],
    '9': [[-1, -1], [1, -1], [-1, -1 / 3], [1, -1 / 3], [0, 0], [-1, 1 / 3], [1, 1 / 3], [-1, 1], [1, 1]],
    '10': [[-1, -1], [1, -1], [0, -2 / 3], [-1, -1 / 3], [1, -1 / 3], [-1, 1 / 3], [1, 1 / 3], [0, 2 / 3], [-1, 1], [1, 1]],
}

function drawIndex(ctx: Ctx, card: PlayingCard, color: string, fonts: CardFonts, flipped: boolean) {
    ctx.save()
    if (flipped) {
        ctx.translate(TEX_W, TEX_H)
        ctx.rotate(Math.PI)
    }
    const x = 90
    const rankSize = card.rank === '10' ? 98 : 120
    ctx.fillStyle = color
    ctx.font = `700 ${rankSize}px ${fonts.sans}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    setLetterSpacing(ctx, card.rank === '10' ? '-7px' : '0px')
    ctx.fillText(card.rank, x, 154)
    setLetterSpacing(ctx, '0px')
    drawSuit(ctx, card.suit, x, 218, 66, 0, color)
    ctx.restore()
}

function drawPips(ctx: Ctx, card: PlayingCard, color: string) {
    const layout = PIP_LAYOUTS[card.rank]
    if (!layout) return
    const cx = TEX_W / 2
    const cy = TEX_H / 2
    for (const [col, row] of layout) {
        const x = cx + col * 152
        const y = cy + row * 300
        drawSuit(ctx, card.suit, x, y, 128, row > 0 ? Math.PI : 0, color)
    }
}

function drawAce(ctx: Ctx, card: PlayingCard, color: string, fonts: CardFonts) {
    const cx = TEX_W / 2
    const cy = TEX_H / 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, 238, 0, Math.PI * 2)
    ctx.lineWidth = 3
    ctx.strokeStyle = LIME_ON_PAPER
    ctx.stroke()
    ctx.setLineDash([3, 11])
    ctx.beginPath()
    ctx.arc(cx, cy, 214, 0, Math.PI * 2)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(10,11,13,0.28)'
    ctx.stroke()
    ctx.setLineDash([])
    drawSuit(ctx, card.suit, cx, cy, 320, 0, color)
    ctx.fillStyle = 'rgba(10,11,13,0.62)'
    ctx.font = `500 20px ${fonts.mono}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    setLetterSpacing(ctx, '6px')
    ctx.fillText('// SCOUT GAMING', cx, cy + 196)
    setLetterSpacing(ctx, '0px')
    ctx.restore()
}

function drawCourt(ctx: Ctx, card: PlayingCard, color: string, fonts: CardFonts) {
    const x = 112
    const y = 252
    const w = TEX_W - 224
    const h = TEX_H - 504
    const cx = TEX_W / 2
    const cy = TEX_H / 2

    ctx.save()
    roundedRect(ctx, x, y, w, h, 28)
    ctx.clip()
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.08
    ctx.lineWidth = 2
    for (let i = -h; i < w + h; i += 18) {
        ctx.beginPath()
        ctx.moveTo(x + i, y)
        ctx.lineTo(x + i - h, y + h)
        ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = PAPER
    ctx.fillRect(x, cy - 170, w, 340)
    ctx.restore()

    roundedRect(ctx, x, y, w, h, 28)
    ctx.lineWidth = 3
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.75
    ctx.stroke()
    ctx.globalAlpha = 1

    ctx.fillStyle = color
    ctx.font = `700 300px ${fonts.sans}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(card.rank, cx, cy - 36)

    drawSuit(ctx, card.suit, x + 52, y + 52, 56, 0, color)
    drawSuit(ctx, card.suit, x + w - 52, y + h - 52, 56, Math.PI, color)

    ctx.fillStyle = 'rgba(10,11,13,0.65)'
    ctx.font = `500 22px ${fonts.mono}`
    setLetterSpacing(ctx, '7px')
    ctx.fillText(RANK_NAME_SV[card.rank].toUpperCase(), cx, cy + 122)
    setLetterSpacing(ctx, '0px')
    ctx.fillStyle = LIME_ON_PAPER
    ctx.fillRect(cx - 40, cy + 146, 80, 4)
}

function drawWordmark(ctx: Ctx, fonts: CardFonts, x: number, y: number, size: number, ink: string, slash: string) {
    ctx.font = `600 ${size}px ${fonts.sans}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    setLetterSpacing(ctx, `${-size * 0.02}px`)
    const parts: [string, string][] = [
        ['scout', ink],
        ['/', slash],
        ['gaming', ink],
    ]
    const total = parts.reduce((sum, [text]) => sum + ctx.measureText(text).width, 0)
    let cursor = x - total / 2
    for (const [text, fill] of parts) {
        ctx.fillStyle = fill
        ctx.fillText(text, cursor, y)
        cursor += ctx.measureText(text).width
    }
    setLetterSpacing(ctx, '0px')
}

export function drawCardFace(card: PlayingCard, fonts: CardFonts): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = TEX_H
    const ctx = canvas.getContext('2d') as Ctx
    const color = isRed(card.suit) ? RED : INK

    roundedRect(ctx, 0, 0, TEX_W, TEX_H, CORNER)
    ctx.fillStyle = PAPER
    ctx.fill()
    const sheen = ctx.createLinearGradient(0, 0, TEX_W, TEX_H)
    sheen.addColorStop(0, 'rgba(255,255,255,0.45)')
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)')
    sheen.addColorStop(1, 'rgba(10,11,13,0.06)')
    ctx.fillStyle = sheen
    ctx.fill()

    roundedRect(ctx, 26, 26, TEX_W - 52, TEX_H - 52, CORNER - 18)
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(10,11,13,0.10)'
    ctx.stroke()

    drawIndex(ctx, card, color, fonts, false)
    drawIndex(ctx, card, color, fonts, true)

    if (card.rank === 'A') drawAce(ctx, card, color, fonts)
    else if (isCourt(card.rank)) drawCourt(ctx, card, color, fonts)
    else drawPips(ctx, card, color)

    drawWordmark(ctx, fonts, TEX_W / 2, TEX_H - 46, 26, 'rgba(10,11,13,0.72)', LIME_ON_PAPER)
    return canvas
}

/* ---------- back ---------- */

export function drawCardBack(fonts: CardFonts): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = TEX_H
    const ctx = canvas.getContext('2d') as Ctx
    const cx = TEX_W / 2
    const cy = TEX_H / 2

    roundedRect(ctx, 0, 0, TEX_W, TEX_H, CORNER)
    ctx.fillStyle = INK
    ctx.fill()

    const inset = 30
    ctx.save()
    roundedRect(ctx, inset + 12, inset + 12, TEX_W - 2 * (inset + 12), TEX_H - 2 * (inset + 12), CORNER - 26)
    ctx.clip()
    ctx.strokeStyle = 'rgba(214,255,58,0.16)'
    ctx.lineWidth = 1
    for (let x = 0; x <= TEX_W; x += 48) {
        ctx.beginPath()
        ctx.moveTo(x + 0.5, 0)
        ctx.lineTo(x + 0.5, TEX_H)
        ctx.stroke()
    }
    for (let y = 0; y <= TEX_H; y += 48) {
        ctx.beginPath()
        ctx.moveTo(0, y + 0.5)
        ctx.lineTo(TEX_W, y + 0.5)
        ctx.stroke()
    }
    const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 560)
    glow.addColorStop(0, 'rgba(214,255,58,0.18)')
    glow.addColorStop(1, 'rgba(214,255,58,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, TEX_W, TEX_H)
    ctx.restore()

    roundedRect(ctx, inset, inset, TEX_W - 2 * inset, TEX_H - 2 * inset, CORNER - 14)
    ctx.lineWidth = 3
    ctx.strokeStyle = LIME
    ctx.stroke()

    const suitRow: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
    suitRow.forEach((suit, i) => {
        const color = isRed(suit) ? RED : '#f2f1ed'
        drawSuit(ctx, suit, cx + (i - 1.5) * 60, 128, 34, 0, color)
        drawSuit(ctx, suit, cx - (i - 1.5) * 60, TEX_H - 128, 34, Math.PI, color)
    })

    drawWordmark(ctx, fonts, cx, cy + 18, 80, '#f2f1ed', LIME)

    ctx.fillStyle = LIME
    ctx.font = `500 22px ${fonts.mono}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    setLetterSpacing(ctx, '7px')
    ctx.fillText('// LIVE-DEALER BLACKJACK', cx, cy + 84)
    setLetterSpacing(ctx, '0px')

    ctx.fillStyle = 'rgba(242,241,237,0.5)'
    ctx.font = `500 17px ${fonts.mono}`
    setLetterSpacing(ctx, '5px')
    ctx.fillText('18+ · DEMO UTAN RIKTIGA PENGAR', cx, TEX_H - 196)
    ctx.fillText('ONE TABLE. YOUR RULES.', cx, 196)
    setLetterSpacing(ctx, '0px')

    return canvas
}
