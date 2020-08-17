import * as THREE from '../../libs/three/three.module.js';
import { GLTFLoader } from '../../libs/three/jsm/GLTFLoader.js';
import { RGBELoader } from '../../libs/three/jsm/RGBELoader.js';
import { XRControllerModelFactory } from '../../libs/three/jsm/XRControllerModelFactory.js';
import { Stats } from '../../libs/stats.module.js';
import { VRButton } from '../../libs/VRButton.js';
import { TeleportMesh } from '../../libs/TeleportMesh.js';
import { Player } from '../../libs/Player.js';
import { LoadingBar } from '../../libs/LoadingBar.js';

class App{
	constructor(){
		const container = document.createElement( 'div' );
		document.body.appendChild( container );

		this.assetsPath = '../../assets/';
        
		this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 3000 );
		this.camera.position.set( 0, 1.6, 0 );
        
		this.scene = new THREE.Scene();
        
		const ambient = new THREE.HemisphereLight(0x555555, 0x999999);
		this.scene.add(ambient);
		
		this.sun = new THREE.DirectionalLight( 0xAAAAFF, 2.5 );
		this.sun.castShadow = true;

		const lightSize = 5;
        this.sun.shadow.camera.near = 0.1;
        this.sun.shadow.camera.far = 17;
		this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -lightSize;
		this.sun.shadow.camera.right = this.sun.shadow.camera.top = lightSize;

        //this.sun.shadow.bias = 0.0039;
        this.sun.shadow.mapSize.width = 1024;
        this.sun.shadow.mapSize.height = 1024;
        
		this.sun.position.set( 0, 10, 10 );
		this.scene.add( this.sun );
		
		this.debug = { showPath:false, teleport: true };
			
		this.renderer = new THREE.WebGLRenderer({ antialias: true } );
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.renderer.shadowMap.enabled = true;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
		container.appendChild( this.renderer.domElement );
        this.setEnvironment();

        this.workingMatrix = new THREE.Matrix4();

		this.clock = new THREE.Clock();
		
		this.stats = new Stats();
		container.appendChild( this.stats.dom );
		
		this.loadingBar = new LoadingBar();
        
		this.loadEnvironment();
        
		this.raycaster = new THREE.Raycaster();
    	this.renderer.domElement.addEventListener( 'click', raycast, false );
			
    	this.loading = true;
    	
    	const self = this;
    	const mouse = { x:0, y:0 };
    	
    	function raycast(e){
            //None VR movement
    		if ( self.loading || self.renderer.xr.isPresenting ) return;
    		
			mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
			mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;

			//2. set the picking ray from the camera position and mouse coordinates
			self.raycaster.setFromCamera( mouse, self.camera );    

			//3. compute intersections
			const intersects = self.raycaster.intersectObject( self.navmesh );
			
			if (intersects.length>0){
				const pt = intersects[0].point;
				
				// Teleport on ctrl/cmd click or RMB.
				if (e.metaKey || e.ctrlKey || e.button === 2) {
					const player = self.fred.object;
					player.position.copy(pt);
					self.fred.navMeshGroup = self.pathfinder.getGroup(self.ZONE, player.position);
					const closestNode = self.pathfinder.getClosestNode(player.position, self.ZONE, self.fred.navMeshGroup);
					if (self.pathLines) self.scene.remove(self.pathLines);
					if (self.calculatedPath) self.calculatedPath.length = 0;
					self.fred.action = 'idle';
					return;
				}
				
				self.player.newPath(pt, true);
			}	
		}
		
		window.addEventListener('resize', function(){ 
			self.camera.aspect = window.innerWidth / window.innerHeight;
    		self.camera.updateProjectionMatrix();

    		self.renderer.setSize( window.innerWidth, window.innerHeight );  
    	});
	}
	
    setEnvironment(){
        const loader = new RGBELoader().setDataType( THREE.UnsignedByteType );
        const pmremGenerator = new THREE.PMREMGenerator( this.renderer );
        pmremGenerator.compileEquirectangularShader();
        
        const self = this;
        
        loader.load( '../../assets/hdr/venice_sunset_1k.hdr', ( texture ) => {
          const envMap = pmremGenerator.fromEquirectangular( texture ).texture;
          pmremGenerator.dispose();

          self.scene.environment = envMap;

        }, undefined, (err)=>{
            console.error( 'An error occurred setting the environment');
        } );
    }
    
	loadEnvironment(){
        
		const loader = new GLTFLoader( ).setPath(this.assetsPath);
        const self = this;
		
		// Load a glTF resource
		loader.load(
			// resource URL
			'dungeon.glb',
			// called when the resource is loaded
			function ( gltf ) {

				self.scene.add( gltf.scene );
				
				gltf.scene.traverse(function (child) {
    				if (child.isMesh){
						if (child.name=="Navmesh"){
							child.material.visible = false;
							self.navmesh = child;
						}else{
							child.castShadow = false;
							child.receiveShadow = true;
						}
					}
				});
                
                const scale = 0.5;
                gltf.scene.scale.set( scale, scale, scale );
                
                self.initGame();
			},
			// called while loading is progressing
			function ( xhr ) {

				self.loadingBar.progress = (xhr.loaded / xhr.total);
				
			},
			// called when loading has errors
			function ( error ) {

				console.log( 'An error happened' );

			}
		);
	}			
	
	initGame(){
		this.player = this.createPlayer();
        
        //Next location marker
        this.locationMarker = this.createLocationMarker();
        
        const locations = [
            new THREE.Vector3(-0.409, 0.086, 4.038),
            new THREE.Vector3(-0.846, 0.112, 5.777),
            new THREE.Vector3( 5.220, 0.176, 2.677)
            //new THREE.Vector3(-0.409, 0.086, 4.038)
        ]
        
        const self = this;
        
        this.teleports = [];
        locations.forEach( location => {
            const teleport = new TeleportMesh();
            teleport.position.copy( location );
            self.scene.add( teleport );
            self.teleports.push(teleport);
        })
        
		this.setupXR();

		this.loading = false;

		this.renderer.setAnimationLoop( this.render.bind(this) );

		this.loadingBar.visible = false;
	}
	
    createLocationMarker(){
        const geometry = new THREE.SphereGeometry(0.03, 8, 6);
        const material = new THREE.MeshBasicMaterial( { color: 0xFF0000 });
        const mesh = new THREE.Mesh( geometry, material );
        mesh.visible = false;
        this.scene.add( mesh );
        return mesh;
    }
	
    buildControllers(){
        const controllerModelFactory = new XRControllerModelFactory();

        const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, -1 ) ] );

        const line = new THREE.Line( geometry );
        line.name = 'ray';
		line.scale.z = 10;
        
        const controllers = [];
        
        for( let i=0; i<=1; i++){
            const controller = this.renderer.xr.getController( i );
            controller.userData.index = i;
            controller.userData.selectPressed = false;
            controller.add( line.clone() );
            controllers.push( controller );
            this.dolly.add( controller );
            
            const grip = this.renderer.xr.getControllerGrip( i );
            grip.add( controllerModelFactory.createControllerModel( grip ) );
            this.dolly.add( grip );
        }  
        
        return controllers;
    }
    
    setupXR(){
        this.renderer.xr.enabled = true;

        const self = this;
        
        function onSelectStart( ){
            this.userData.selectPressed = true;
            if (self.locationMarker.visible){
                const pos = self.locationMarker.position;
                console.log( `${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)}`);
            }else if (this.userData.teleport){
                self.player.object.position.copy( this.userData.teleport.position );
                self.teleports.forEach( teleport => teleport.fadeOut(0.5) );
            }
        }
        
        function onSelectEnd( ){
            this.userData.selectPressed = false;
        }
        
        function onSqueezeStart( ){
            this.userData.squeezePressed = true;
            self.teleports.forEach( teleport => teleport.fadeIn(1) );
        }
        
        function onSqueezeEnd( ){
            this.userData.squeezePressed = false;
            self.teleports.forEach( teleport => teleport.fadeOut(1) );
        }
        
        const btn = new VRButton( this.renderer );
        
        this.controllers = this.buildControllers();
        
        this.controllers.forEach( controller => {
            controller.addEventListener( 'selectstart', onSelectStart );
            controller.addEventListener( 'selectend', onSelectEnd);
            controller.addEventListener( 'squeezestart', onSqueezeStart );
            controller.addEventListener( 'squeezeend', onSqueezeEnd );
        })
        
        this.collisionObjects = [this.navmesh];
        this.teleports.forEach( teleport => self.collisionObjects.push(teleport.children[0]) );
                    
    }

    intersectObjects( controller ) {

        const line = controller.getObjectByName( 'ray' );
        this.workingMatrix.identity().extractRotation( controller.matrixWorld );

        this.raycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
        this.raycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( this.workingMatrix );

        const intersects = this.raycaster.intersectObjects( this.collisionObjects );

        controller.userData.teleport = undefined;
        
        if ( intersects.length > 0 ) {

            const intersect = intersects[ 0 ];
            line.scale.z = intersect.distance;
            
            if (intersect.object === this.navmesh){
                this.locationMarker.scale.set(1,1,1);
                this.locationMarker.position.copy( intersect.point );
                this.locationMarker.visible = true;
            }else if (intersect.object.parent && intersect.object.parent instanceof TeleportMesh){
                intersect.object.parent.selected = true;
                controller.userData.teleport = intersect.object.parent;
            }
    
        } 

    }

    createPlayer(){
        const target = new THREE.Object3D();
        target.position.set(-3, 0.25, 2); 
        
        const options = {
					object: target,
					speed: 5,
					app: this,
					name: 'player',
					npc: false
				};
				
		const player = new Player(options);
           
        this.dolly = new THREE.Object3D();
        this.dolly.position.set(0, -0.25, 0);
        this.dolly.add(this.camera);
        
        this.dummyCam = new THREE.Object3D();
        this.camera.add( this.dummyCam );
        
        target.add(this.dolly);
        
        this.dolly.rotation.y = Math.PI;
        
        return player;
    }
    
	render(){
		const dt = this.clock.getDelta();
		const self = this;
		
		this.sun.position.copy(this.dummyCam.position);
		this.sun.position.y += 10;
		this.sun.position.z += 10;
		
		this.stats.update();
        
        if (this.renderer.xr.isPresenting){
            this.locationMarker.visible = false;

            this.teleports.forEach( teleport =>{
                teleport.selected = false;
                teleport.update();
            });

            this.controllers.forEach( controller => {
                self.intersectObjects( controller );
            })

            this.player.update(dt);
        }
		
		this.renderer.render(this.scene, this.camera);
	}
}

export { App };