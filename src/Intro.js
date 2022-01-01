import * as THREE from 'three'
import { FirstPersonControls } from 'three/examples/jsm/controls/FirstPersonControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { ShadowMapViewer } from 'three/examples/jsm/utils/ShadowMapViewer.js'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js'

const SHADOW_MAP_WIDTH = 2048
const SHADOW_MAP_HEIGHT = 1024

let SCREEN_WIDTH = window.innerWidth
let SCREEN_HEIGHT = window.innerHeight
const FLOOR = - 250

let camera, controls, scene, renderer
let container
let sky, sun

const NEAR = 10, FAR = 3000

let mixer

const morphs = []

let light
let lightShadowMapViewer

const clock = new THREE.Clock()

let showHUD = false

init()
animate()


function init() {

    let fogColor = '#FDF1CD'
    let spotlightColor = '#FEFFD6'

    container = document.createElement('div')
    document.body.appendChild(container)

    // CAMERA

    camera = new THREE.PerspectiveCamera(23, SCREEN_WIDTH / SCREEN_HEIGHT, NEAR, FAR)
    camera.position.set(700, 50, 1900)

    // SCENE

    scene = new THREE.Scene()
    scene.background = new THREE.Color('#47D1FF')
    scene.fog = new THREE.Fog(fogColor, 1000, FAR)

    // LIGHTS

    const ambient = new THREE.AmbientLight(0x444444)
    scene.add(ambient)

    light = new THREE.SpotLight(spotlightColor, 1, 0, Math.PI / 4, 0.3)
    light.position.set(0, 1500, 1000)
    light.target.position.set(0, 0, 0)

    light.castShadow = true
    light.shadow.camera.near = 1200
    light.shadow.camera.far = 2500
    light.shadow.bias = 0.0001

    light.shadow.mapSize.width = SHADOW_MAP_WIDTH
    light.shadow.mapSize.height = SHADOW_MAP_HEIGHT

    scene.add(light)

    createHUD()
    createScene()

    // RENDERER

    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT)
    container.appendChild(renderer.domElement)

    renderer.outputEncoding = THREE.sRGBEncoding
    renderer.autoClear = false

    //

    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap

    // Sky

    sky = new Sky()
    sky.scale.setScalar(450000)
    scene.add(sky)

    sun = new THREE.Vector3()

    const defaultSkyValues = {
        turbidity: 10,
        rayleigh: 1,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.7,
        elevation: 1,
        azimuth: 180,
        exposure: renderer.toneMappingExposure
    }

    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = defaultSkyValues.turbidity;
    uniforms['rayleigh'].value = defaultSkyValues.rayleigh;
    uniforms['mieCoefficient'].value = defaultSkyValues.mieCoefficient;
    uniforms['mieDirectionalG'].value = defaultSkyValues.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - defaultSkyValues.elevation);
    const theta = THREE.MathUtils.degToRad(defaultSkyValues.azimuth);

    sun.setFromSphericalCoords(1, phi, theta);

    uniforms['sunPosition'].value.copy(sun);
    

    renderer.toneMappingExposure = defaultSkyValues.exposure;
    renderer.render(scene, camera);

    // Cloud Texture

    const size = 128
    const data = new Uint8Array(size * size * size)

    let i = 0
    const scale = 0.05
    const perlin = new ImprovedNoise()
    const vector = new THREE.Vector3()

    for (let z = 0; z < size; z++) {

        for (let y = 0; y < size; y++) {

            for (let x = 0; x < size; x++) {

                const d = 1.0 - vector.set(x, y, z).subScalar(size / 2).divideScalar(size).length()
                data[i] = (128 + 128 * perlin.noise(x * scale / 1.5, y * scale, z * scale / 1.5)) * d * d
                i++

            }

        }

    }

    const texture = new THREE.DataTexture3D(data, size, size, size)
    texture.format = THREE.RedFormat
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.unpackAlignment = 1
    texture.needsUpdate = true

    // Cloud Material

    const vertexShader = /* glsl */`
					in vec3 position;
					uniform mat4 modelMatrix;
					uniform mat4 modelViewMatrix;
					uniform mat4 projectionMatrix;
					uniform vec3 cameraPos;
					out vec3 vOrigin;
					out vec3 vDirection;
					void main() {
						vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
						vOrigin = vec3( inverse( modelMatrix ) * vec4( cameraPos, 1.0 ) ).xyz;
						vDirection = position - vOrigin;
						gl_Position = projectionMatrix * mvPosition;
					}
				`

    const fragmentShader = /* glsl */`
					precision highp float;
					precision highp sampler3D;
					uniform mat4 modelViewMatrix;
					uniform mat4 projectionMatrix;
					in vec3 vOrigin;
					in vec3 vDirection;
					out vec4 color;
					uniform vec3 base;
					uniform sampler3D map;
					uniform float threshold;
					uniform float range;
					uniform float opacity;
					uniform float steps;
					uniform float frame;
					uint wang_hash(uint seed)
					{
							seed = (seed ^ 61u) ^ (seed >> 16u);
							seed *= 9u;
							seed = seed ^ (seed >> 4u);
							seed *= 0x27d4eb2du;
							seed = seed ^ (seed >> 15u);
							return seed;
					}
					float randomFloat(inout uint seed)
					{
							return float(wang_hash(seed)) / 4294967296.;
					}
					vec2 hitBox( vec3 orig, vec3 dir ) {
						const vec3 box_min = vec3( - 0.5 );
						const vec3 box_max = vec3( 0.5 );
						vec3 inv_dir = 1.0 / dir;
						vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
						vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
						vec3 tmin = min( tmin_tmp, tmax_tmp );
						vec3 tmax = max( tmin_tmp, tmax_tmp );
						float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
						float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
						return vec2( t0, t1 );
					}
					float sample1( vec3 p ) {
						return texture( map, p ).r;
					}
					float shading( vec3 coord ) {
						float step = 0.01;
						return sample1( coord + vec3( - step ) ) - sample1( coord + vec3( step ) );
					}
					void main(){
						vec3 rayDir = normalize( vDirection );
						vec2 bounds = hitBox( vOrigin, rayDir );
						if ( bounds.x > bounds.y ) discard;
						bounds.x = max( bounds.x, 0.0 );
						vec3 p = vOrigin + bounds.x * rayDir;
						vec3 inc = 1.0 / abs( rayDir );
						float delta = min( inc.x, min( inc.y, inc.z ) );
						delta /= steps;
						// Jitter
						// Nice little seed from
						// https://blog.demofox.org/2020/05/25/casual-shadertoy-path-tracing-1-basic-camera-diffuse-emissive/
						uint seed = uint( gl_FragCoord.x ) * uint( 1973 ) + uint( gl_FragCoord.y ) * uint( 9277 ) + uint( frame ) * uint( 26699 );
						vec3 size = vec3( textureSize( map, 0 ) );
						float randNum = randomFloat( seed ) * 2.0 - 1.0;
						p += rayDir * randNum * ( 1.0 / size );
						//
						vec4 ac = vec4( base, 0.0 );
						for ( float t = bounds.x; t < bounds.y; t += delta ) {
							float d = sample1( p + 0.5 );
							d = smoothstep( threshold - range, threshold + range, d ) * opacity;
							float col = shading( p + 0.5 ) * 3.0 + ( ( p.x + p.y ) * 0.25 ) + 0.2;
							ac.rgb += ( 1.0 - ac.a ) * d * col;
							ac.a += ( 1.0 - ac.a ) * d;
							if ( ac.a >= 0.95 ) break;
							p += rayDir * delta;
						}
						color = ac;
						if ( color.a == 0.0 ) discard;
					}
				`

    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            base: { value: new THREE.Color(0x798aa0) },
            map: { value: texture },
            cameraPos: { value: new THREE.Vector3() },
            threshold: { value: 0.25 },
            opacity: { value: 0.25 },
            range: { value: 0.1 },
            steps: { value: 100 },
            frame: { value: 0 }
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        transparent: true
    })

    const cloudMesh = new THREE.Mesh(geometry, material);
    scene.add(cloudMesh)

    


    // CONTROLS

    controls = new FirstPersonControls(camera, renderer.domElement)

    controls.lookSpeed = 0.025
    controls.movementSpeed = 500
    controls.noFly = false
    controls.lookVertical = false

    controls.lookAt(scene.position)

   

    window.addEventListener('resize', onWindowResize)
    window.addEventListener('keydown', onKeyDown)

}

function onWindowResize() {

    SCREEN_WIDTH = window.innerWidth
    SCREEN_HEIGHT = window.innerHeight

    camera.aspect = SCREEN_WIDTH / SCREEN_HEIGHT
    camera.updateProjectionMatrix()

    renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT)

    controls.handleResize()

}

function onKeyDown(event) {

    switch (event.keyCode) {

        case 84:	/*t*/
            showHUD = !showHUD
            break

    }

}

function createHUD() {

    lightShadowMapViewer = new ShadowMapViewer(light)
    lightShadowMapViewer.position.x = 10
    lightShadowMapViewer.position.y = SCREEN_HEIGHT - (SHADOW_MAP_HEIGHT / 4) - 10
    lightShadowMapViewer.size.width = SHADOW_MAP_WIDTH / 4
    lightShadowMapViewer.size.height = SHADOW_MAP_HEIGHT / 4
    lightShadowMapViewer.update()

}

function createScene() {

    let groundColor = '#FDF1CD'
    let textColor = '#D46F93'

    // GROUND

    const geometry = new THREE.PlaneGeometry(100, 100)
    const planeMaterial = new THREE.MeshPhongMaterial({ color: groundColor })

    const ground = new THREE.Mesh(geometry, planeMaterial)

    ground.position.set(0, FLOOR, 0)
    ground.rotation.x = - Math.PI / 2
    ground.scale.set(100, 100, 100)

    ground.castShadow = false
    ground.receiveShadow = true

    scene.add(ground)

    // TEXT

    const loader = new FontLoader()
    loader.load('./fonts/helvetiker_regular.typeface.json', function (font) {

        const textGeo = new TextGeometry("Abijit Rangesh", {

            font: font,

            size: 100,
            height: 140,
            curveSegments: 12,

            bevelThickness: 2,
            bevelSize: 5,
            bevelEnabled: true

        })

        textGeo.computeBoundingBox()
        const centerOffset = - 0.5 * (textGeo.boundingBox.max.x - textGeo.boundingBox.min.x)

        const textMaterial = new THREE.MeshPhongMaterial({ color: textColor, specular: 0xffffff })

        const mesh = new THREE.Mesh(textGeo, textMaterial)
        mesh.position.x = centerOffset
        mesh.position.y = FLOOR + 67

        mesh.castShadow = true
        mesh.receiveShadow = true

        scene.add(mesh)

        

    })

    // CUBES

    const cubes1 = new THREE.Mesh(new THREE.BoxGeometry(1500, 220, 150), planeMaterial)

    cubes1.position.y = FLOOR - 50
    cubes1.position.z = 20

    cubes1.castShadow = true
    cubes1.receiveShadow = true

    scene.add(cubes1)

    const cubes2 = new THREE.Mesh(new THREE.BoxGeometry(1600, 170, 250), planeMaterial)

    cubes2.position.y = FLOOR - 50
    cubes2.position.z = 20

    cubes2.castShadow = true
    cubes2.receiveShadow = true

    scene.add(cubes2)

    // MORPHS

    mixer = new THREE.AnimationMixer(scene)

    function addMorph(mesh, clip, speed, duration, x, y, z, fudgeColor) {

        mesh = mesh.clone()
        mesh.material = mesh.material.clone()

        if (fudgeColor) {

            mesh.material.color.offsetHSL(0, Math.random() * 0.5 - 0.25, Math.random() * 0.5 - 0.25)

        }

        mesh.speed = speed

        mixer.clipAction(clip, mesh).
            setDuration(duration).
            // to shift the playback out of phase:
            startAt(- duration * Math.random()).
            play()

        mesh.position.set(x, y, z)
        mesh.rotation.y = Math.PI / 2

        mesh.castShadow = true
        mesh.receiveShadow = true

        scene.add(mesh)

        morphs.push(mesh)

    }

    const gltfloader = new GLTFLoader()

    /* gltfloader.load("./models/Horse.glb", function (gltf) {

        const mesh = gltf.scene.children[0]

        const clip = gltf.animations[0]

        addMorph(mesh, clip, 550, 1, 100 - Math.random() * 1000, FLOOR, 300, true)
        addMorph(mesh, clip, 550, 1, 100 - Math.random() * 1000, FLOOR, 450, true)
        addMorph(mesh, clip, 550, 1, 100 - Math.random() * 1000, FLOOR, 600, true)

        addMorph(mesh, clip, 550, 1, 100 - Math.random() * 1000, FLOOR, - 300, true)
        addMorph(mesh, clip, 550, 1, 100 - Math.random() * 1000, FLOOR, - 450, true)
        addMorph(mesh, clip, 550, 1, 100 - Math.random() * 1000, FLOOR, - 600, true)

    })
 */
    gltfloader.load("./models/Flamingo.glb", function (gltf) {

        const mesh = gltf.scene.children[0]
        const clip = gltf.animations[0]

        addMorph(mesh, clip, 500, 1, 500 - Math.random() * 1000, FLOOR + 350, 40)

    })

    gltfloader.load("./models/Stork.glb", function (gltf) {

        const mesh = gltf.scene.children[0]
        const clip = gltf.animations[0]

        addMorph(mesh, clip, 350, 1, 500 - Math.random() * 1000, FLOOR + 350, 340)

    })

    gltfloader.load("./models/Parrot.glb", function (gltf) {

        const mesh = gltf.scene.children[0]
        const clip = gltf.animations[0]

        addMorph(mesh, clip, 450, 0.5, 500 - Math.random() * 1000, FLOOR + 300, 700)

    })

}

function animate() {

    requestAnimationFrame(animate)

    render()

}

function render() {

    const delta = clock.getDelta()

    mixer.update(delta)

    for (let i = 0; i < morphs.length; i++) {

        const morph = morphs[i]

        morph.position.x += morph.speed * delta

        if (morph.position.x > 2000) {

            morph.position.x = - 1000 - Math.random() * 500

        }

    }

    controls.update(delta)

    renderer.clear()
    renderer.render(scene, camera)

    // Render debug HUD with shadow map

    if (showHUD) {

        lightShadowMapViewer.render(renderer)

    }

}