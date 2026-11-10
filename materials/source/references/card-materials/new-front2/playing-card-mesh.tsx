'use client'

import {useEffect, useMemo} from 'react'
import * as THREE from 'three'
import type {ThreeElements} from '@react-three/fiber'
import {CARD_T, type CardGeometries} from './card-geometry'

type PlayingCardMeshProps = ThreeElements['group'] & {
    faceTexture: THREE.Texture
    backTexture: THREE.Texture
    geometries: CardGeometries
    /** Extra lacquer on the hero card so highlights read clearly. */
    glossy?: boolean
}

export function PlayingCardMesh({faceTexture, backTexture, geometries, glossy = false, ...groupProps}: PlayingCardMeshProps) {
    // ExtrudeGeometry has two groups: caps (index 0) and sides (index 1). The caps are
    // hidden because the textured face planes sit on top of them.
    const edgeMaterials = useMemo(
        () => [
            new THREE.MeshBasicMaterial({visible: false}),
            new THREE.MeshStandardMaterial({color: '#e6e3da', roughness: 0.85, metalness: 0}),
        ],
        [],
    )

    useEffect(() => () => edgeMaterials.forEach((m) => m.dispose()), [edgeMaterials])

    return (
        <group {...groupProps}>
            <mesh geometry={geometries.face} position-z={CARD_T / 2 + 0.0015}>
                <meshPhysicalMaterial
                    map={faceTexture}
                    roughness={glossy ? 0.28 : 0.36}
                    metalness={0.06}
                    clearcoat={1}
                    clearcoatRoughness={glossy ? 0.08 : 0.14}
                    envMapIntensity={glossy ? 1.25 : 1}
                    iridescence={0.12}
                    iridescenceIOR={1.4}
                    iridescenceThicknessRange={[120, 380]}
                />
            </mesh>
            <mesh geometry={geometries.face} position-z={-(CARD_T / 2 + 0.0015)} rotation-y={Math.PI}>
                <meshPhysicalMaterial
                    map={backTexture}
                    roughness={0.32}
                    metalness={0.35}
                    clearcoat={1}
                    clearcoatRoughness={0.1}
                    envMapIntensity={1.2}
                    iridescence={0.4}
                    iridescenceIOR={1.6}
                    iridescenceThicknessRange={[140, 520]}
                />
            </mesh>
            <mesh geometry={geometries.edge} material={edgeMaterials}/>
        </group>
    )
}
