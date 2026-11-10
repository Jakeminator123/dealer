import * as THREE from 'three'

/** Poker size, 2.5 x 3.5 units, with a real (thin) thickness. */
export const CARD_W = 2.5
export const CARD_H = 3.5
export const CARD_T = 0.025
export const CARD_R = 0.18

export interface CardGeometries {
    face: THREE.ShapeGeometry
    edge: THREE.ExtrudeGeometry
    dispose: () => void
}

function roundedRectShape(w: number, h: number, r: number) {
    const shape = new THREE.Shape()
    const x = -w / 2
    const y = -h / 2
    shape.moveTo(x + r, y)
    shape.lineTo(x + w - r, y)
    shape.quadraticCurveTo(x + w, y, x + w, y + r)
    shape.lineTo(x + w, y + h - r)
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    shape.lineTo(x + r, y + h)
    shape.quadraticCurveTo(x, y + h, x, y + h - r)
    shape.lineTo(x, y + r)
    shape.quadraticCurveTo(x, y, x + r, y)
    return shape
}

export function createCardGeometries(): CardGeometries {
    const shape = roundedRectShape(CARD_W, CARD_H, CARD_R)

    const face = new THREE.ShapeGeometry(shape, 10)
    // ShapeGeometry writes raw x/y into uv; normalise so the whole texture maps onto the card.
    const uv = face.attributes.uv as THREE.BufferAttribute
    const pos = face.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (pos.getX(i) + CARD_W / 2) / CARD_W, (pos.getY(i) + CARD_H / 2) / CARD_H)
    }
    uv.needsUpdate = true

    const edge = new THREE.ExtrudeGeometry(shape, {depth: CARD_T, bevelEnabled: false, curveSegments: 10})
    edge.translate(0, 0, -CARD_T / 2)

    return {
        face,
        edge,
        dispose: () => {
            face.dispose()
            edge.dispose()
        },
    }
}
