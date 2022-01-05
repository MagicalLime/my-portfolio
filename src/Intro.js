import * as THREE from 'three'
import { FirstPersonControls } from 'three/examples/jsm/controls/FirstPersonControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { ShadowMapViewer } from 'three/examples/jsm/utils/ShadowMapViewer.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const SHADOW_MAP_WIDTH = 2048
const SHADOW_MAP_HEIGHT = 1024

let clouds

let selectedObjects = []

let SCREEN_WIDTH = window.innerWidth
let SCREEN_HEIGHT = window.innerHeight
const FLOOR = - 250

let camera, controls, scene, renderer
let container
let sky, sun

const NEAR = 10, FAR = 10000

let mixer

const morphs = []

let light
let lightShadowMapViewer

const clock = new THREE.Clock()

let outlinePass, composer, effectFXAA

let showHUD = false

const raycaster = new THREE.Raycaster()

const mouse = new THREE.Vector2()

init()
animate()


function init() {

    let fogColor = '#FDF1CD'
    let spotlightColor = '#F2878A'

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
        rayleigh: 3,
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

    // LOADING MANAGER (Currently does not work because the DOM has not been fully loaded before this code is ran)
    const loadingManager = new THREE.LoadingManager()

    loadingManager.onLoad = () => {
        
        const loadingScreen = document.getElementById('loading-screen')
        console.log(loadingScreen)
        loadingScreen.classList.add('fade-out')

        //loadingScreen.addEventListener('transitionend', onTransitionEnd) 
    }

    loadingManager.onProgress = () => {
        console.log("loading file")
    }

    // CLOUDS


    const loader = new OBJLoader(loadingManager)

    clouds = new THREE.Group()

    loader.load("./models/Cloud.obj", (object) => {
        object.position.set(-4000, 100, -6000)
        object.scale.set(2.5, 2.5, 2.5)
        clouds.add(object)
    })
        
    loader.load("./models/Cloud.obj", (object) => {
        object.position.set(-1550, -50, -6500)
        object.scale.set(2, 2, 2)
        clouds.add(object)
    })

    loader.load("./models/Cloud.obj", (object) => {
        object.position.set(1450, -20, -6500)
        object.scale.set(2, 2, 2)
        clouds.add(object)
    })

    loader.load("./models/Cloud.obj", (object) => {
        object.position.set(-6000, 700, -6000)
        object.scale.set(1.75, 1.75, 1.75)
        clouds.add(object)
    })

    scene.add(clouds)

    // RAY PICKING

    composer = new EffectComposer(renderer)

    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)

    outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera)
    
    outlinePass.visibleEdgeColor.set("#63A530")
    outlinePass.edgeStrength = 10
    composer.addPass(outlinePass)

    effectFXAA = new ShaderPass(FXAAShader)
    effectFXAA.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight)
    composer.addPass(effectFXAA)




    // CONTROLS

    controls = new FirstPersonControls(camera, renderer.domElement)

    controls.lookSpeed = 0.0125
    controls.movementSpeed = 500
    controls.noFly = false
    controls.lookVertical = false

    controls.lookAt(scene.position)

   

    window.addEventListener('resize', onWindowResize)
    window.addEventListener('keydown', onKeyDown)

    

}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

function onTransitionEnd(event) {

    event.target.remove();

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
    let textColor = '#FF90B0'

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

        mixer.clipAction(clip, mesh).setDuration(duration).startAt(- duration * Math.random()).play()

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

        addMorph(mesh, clip, 500, 1, 500 - Math.random() * 500, FLOOR + 350, 40)

    })

    gltfloader.load("./models/Stork.glb", function (gltf) {

        const mesh = gltf.scene.children[0]
        const clip = gltf.animations[0]

        addMorph(mesh, clip, 350, 1, 500 - Math.random() * 500, FLOOR + 50 + Math.random() * 350, 340)

    })

    gltfloader.load("./models/Parrot.glb", function (gltf) {

        const mesh = gltf.scene.children[0]
        const clip = gltf.animations[0]

        addMorph(mesh, clip, 450, 0.5, 500 - Math.random() * 500, FLOOR + 50 + Math.random() * 300, 700)

    })

}

function addSelectedObject(object) {
    selectedObjects = []
    selectedObjects.push(object)
    console.log("selected")
}

function animate() {

    
    

    requestAnimationFrame(animate)

    composer.render()

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

    raycaster.setFromCamera(mouse, camera)

    const intersects = raycaster.intersectObjects(clouds.children)
 

    if (intersects.length > 0) {

        const selectedObject = intersects[0].object
        addSelectedObject(selectedObject)
        outlinePass.selectedObjects = selectedObjects
        
        

    } else {

        // outlinePass.selectedObjects = [];

    }

    //renderer.clear()
    //renderer.render(scene, camera)

    // Render debug HUD with shadow map

    if (showHUD) {

        lightShadowMapViewer.render(renderer)

    }

    window.addEventListener('mousemove', onMouseMove, false);

    //window.requestAnimationFrame(render);

    

}