import React, { Component } from "react";
import * as THREE from "three";

export default class Scene extends Component {
    componentDidMount() {
        var scene = new THREE.Scene()
        var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        var renderer = new THREE.WebGLRenderer()
        renderer.setSize(window.innerWidth, window.innerHeight)
        document.body.appendChild(renderer.domElement)
        const radius = 7;  // ui: radius
        const geometry = new THREE.OctahedronGeometry(radius);
        var material = new THREE.MeshPhongMaterial({ color: 0x44aa88 })
        
        var cube = new THREE.Mesh(geometry, material);
        scene.add(cube)
        camera.position.z = 30
        var animate = function () {
            requestAnimationFrame(animate)
            cube.rotation.x += 0.03;
            cube.rotation.y += 0.01;
            renderer.render(scene, camera)
        };
        animate()

        {
            const color = 0xFFFFFF;
            const intensity = 1;
            const light = new THREE.DirectionalLight(color, intensity);
            light.position.set(-1, 2, 4);
            scene.add(light);
        }
    }

    myStyle = {
        margin: 0, 
        height: '100%'
    }

    render() {
        return (
            <div style={this.myStyle}> </div>
        )
    }
}
