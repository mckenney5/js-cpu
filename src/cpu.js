/*
MIT License

Copyright (c) 2024 Adam McKenney

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


*/

/*jshint esversion: 8 */

/* -- Notes --
 * Testing this program requires a webserver, easiest way is running 'python3 -m http.server 8080'
 * and connecting to http://0.0.0.0:8080
 * 
 * register 0 is instruction pointer 
 * video memory requires 3 x screen size for rgb
 *
 * -- TODO --
 * Fix FIXMEs
 * Fix sleep function
 * 
 * -- Wish List --
 * Textbox with assembler support to run a program and buttons
 * Built in font for screen
 * Add keyboard drivers / support
 * Add a register, flags, and memory readout (not in console.log)
 * 
 */

//Global Consts
const MAX_INSTRUCTIONS = 100;
const SCREEN_WIDTH = 200;
const SCREEN_LENGTH = 100;
const SCREEN_PIXEL_SIZE_PX = 2; //how big should the fake pixels be in the browser
const CLOCK_SPEED_MS = 1000;
const REFRESH_RATE_MS = 1000;
const MAX_REGISTERS = 7; //0 is the instruction pointer, min should be 3 (IP, R1, R2)

// Create an array to hold registers
const registers = [];



const flags = {
	// CPU flags for operations, used a lot with jumps
	zero: false, //if math cmd is zero
	sign: false, //enabled if math negative
	overflow: false, //if result is too large
	underflow: false, //if result is too small
	
	gt: false, //greater than
	lt: false, //less than
	eq: false, //equal to
    
	//interrupts: false //set to true to handle hardware interupts / events
};

const Register = {
	// CPU Registers
    binary_value: 0,
    value: 0,
		bounds_check: function(val){
			if(val > 65535)	{
				flags.overflow = true;
				val = 65535;
			} else flags.overflow = false;
			
			if(val < -65535) {
				flags.underflow = true;
				val = -65535;
			} else flags.underflow = false;
			
			if(val < 0) flags.sign = true;
			else flags.overflow = false;
			
			if(val == 0) flags.zero = true;
			else flags.zero = false;
			
			return val;
		},
		
    setv: function(newValue, skip_bounds=false) {
        if(!skip_bounds) newValue = this.bounds_check(newValue);
        this.binary_value = newValue.toString(2);
        this.value = newValue;
        return this.value;
    },

    getv: function() {
        return this.value;
    },
    
    inc: function() {
			return this.setv(this.value + 1, true); //TODO handle flag flips better than just skipping bounds checks
		},
		
		dec: function() {
			return this.setv(this.value - 1, true);
		}
};

let memory = {
    data: [],
    size: 0,

    // Function to initialize memory with zeros
    init: function(new_size) {
        for (let i = 0; i < new_size; i++) {
            this.data.push(0);
        }
        this.size = new_size;
    },
    
    load: function(location, opcodes){
			if(location + opcodes.length > this.size){
				console.log("Out of memory bounds, ignoring. ", location, opcodes);
				return;
			}
			for(var i = 0; i < opcodes.length; i++){
				this.data[location + i] = opcodes[i];
			}
		}
};

const Screen = {
	// Rendered pixel screen in the web browser
	size_x: SCREEN_WIDTH,
	size_y: SCREEN_LENGTH,
	default_color: 'white',
	memory_start: -1, //memory location where screen buffer starts
	memory_end: -1, //where the screen buffer ends
	initalized: false,
	
	draw: function(data=[], bcolor = '') {
		// Modify pixels
		const canvas = document.getElementById("screen");
		var l = this.memory_start; //allows us to count by 3s for RGB. Index of the memory
		for (let i = this.memory_start; i < this.memory_end/3; i++, l++) {
			// loop through every pixel
			var pixel = document.getElementById("pixel" + i); //sets a unique ID per pixel
			if(bcolor != ''){
				pixel.style.backgroundColor = bcolor;
			} else if(bcolor == '' && data == []){
				pixel.style.backgroundColor = 'black';
			} else {
				pixel.style.backgroundColor = "rgb(" + data[l] + ',' + data[++l] + ',' + data[++l] + ')';
			}
		}
	},
	
	init: function() {
		// Spawn pixels on the page
		if(this.initalized) console.log("WARN Screen has been initalized already");
		const canvas = document.getElementById("screen");
		
		// Create screen
		this.memory_start = MAX_INSTRUCTIONS +1;
		this.memory_end = ((this.size_x * this.size_y) + this.memory_start) * 3; //x3 for r/g/b
		canvas.style.display = "grid";
		canvas.style.gridTemplateColumns = "repeat(" + this.size_x + "," + SCREEN_PIXEL_SIZE_PX + "px)";
		canvas.style.gridTemplateRows = "repeat(" + this.size_y + "," + SCREEN_PIXEL_SIZE_PX + "px)";
		
		// Create pixels for the screen
		for (let i = this.memory_start; i < this.memory_end/3; i++) {
			const pixel = document.createElement("div");
			pixel.classList.add("pixel");
			pixel.id = "pixel" + i;
			pixel.style.backgroundColor = this.default_color;
			pixel.style.width = SCREEN_PIXEL_SIZE_PX + "px";
			pixel.style.height = SCREEN_PIXEL_SIZE_PX + "px";
			canvas.appendChild(pixel);
		}
		this.initalized = true;
	}
	
};

function sleep (ms){ //TODO FIXME
		console.log("sleeping");
		return new Promise(resolve => setTimeout(resolve, ms));
}

const bios = {
	screen_refresh: REFRESH_RATE_MS,
	clock_speed: CLOCK_SPEED_MS,
	screen: Screen,
	
	refresh_screen: function(memory) {
		sleep(this.screen_refresh);
		this.screen.draw(memory);
	},
	generate_random: function(min=0, max=255){
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min)) + min;
	}
};

const isa = {
	// Instruction Set Dictionary
	
	'NOP' : 0,
	'HALT': 1,
	'INC' : 2,
	'DEC' : 3,
	'ADD' : 4,
	'SUB' : 5,
	'AND' : 6,
	'OR'  : 7,
	'XOR' : 8,
	'NOT' : 9,
	
	'MOV' : 10, //load from mem. MOV r1 [r2] - pulls data from the address pointed by r2
	'MOVL': 11, //load literal
	'SWAP': 12, //store register data to memory location
	
	'CMP' : 13, //compares r1 to r2 and flips flags
	'JMP' : 14, //blind jump to [r1]
	'JET' : 15, //jump if eq flag is set
	'JLT' : 16, //jump if lt flag is set
	'JGT' : 17, //jump if gt flag is set
	'JZ'  : 18, //jump if zero flag is set
	
	'RAND' : 19, //generates a random number from 0 - 255 and puts it into r1
	'DRAW': 20, //forces a screen redraw
	
	
};

function convert(asm){
	// Converts the assembly verbs to its opcode
	var opcodes = [];
	for(var i = 0; i < asm.length; i++){
		opcodes.push(isa[asm[i]]);
	}
	return opcodes;
}

async function run(ops){
	// Runs the op codes
	// If the user does not halt, the cpu will read and execute video memory (by design)
	const iptr = registers[0];
	
	try {
		for(iptr.setv(0); iptr.getv() < ops.length; iptr.inc()){
			//await sleep(bios.clock_speed); //TODO FIXME does not sleep (spawns a new thread...does not pause main thread)
			switch(ops[iptr.getv()]) {
				case 0:
					//nop
					break;
				case 1:
					//halt
					return;
				case 2:
					//inc rX
					registers[ops[iptr.inc()]].setv(registers[ops[iptr.getv()]].getv() + 1);
					break;
				case 3:
					//dec rX
					registers[ops[iptr.inc()]].setv(registers[ops[iptr.getv()]].getv() - 1);
					break;
				case 4:
					//add rX rY --> rX
					registers[ops[iptr.inc()]].setv(registers[ops[iptr.getv()]].getv() + registers[ops[iptr.inc()]].getv());
					break;
				case 5:
					//sub rX rY --> rX
					registers[ops[iptr.inc()]].setv(registers[ops[iptr.getv()]].getv() - registers[ops[iptr.inc()]].getv());
					break;
				case 6:
					//and rX rY --> rX
					registers[ops[iptr.inc()]].setv(registers[ops[iptr.getv()]].getv() & registers[ops[iptr.inc()]].getv());
					break;
				case 7:
					//or rX rY --> rX
					registers[ops[iptr.inc()]].setv(registers[ops[iptr.getv()]].getv() | registers[ops[iptr.inc()]].getv());
					break;
				case 8:
					//xor rX rY --> rX
					registers[ops[iptr.inc()]].setv(registers[ops[iptr.getv()]].getv() ^ registers[ops[iptr.inc()]].getv());
					break;
				case 9:
					//not rX --> rX
					registers[ops[iptr.inc()]].setv(~ registers[ops[iptr.getv()]].getv());
					break;
			
			// -- Memory Instructions --	\\
					
				case 10:
					//mov rX = [rY]
					registers[ops[iptr.inc()]].setv(memory.data[registers[ops[iptr.inc()]].getv()]);
					break;
				case 11:
					//movl rX = next_instruction
					registers[ops[iptr.inc()]].setv(ops[iptr.inc()]);
					break;
				case 12:
					//swap registers with XOR (O(1)) rX=rX^rY, rY=rX^rY, rX=rX^rY
					registers[ops[iptr.inc()]].setv(registers[ops[iptr.getv()]].getv() ^ registers[ops[iptr.inc()]].getv());
					registers[ops[iptr.getv()]].setv(registers[ops[iptr.getv()-1]].getv() ^ registers[ops[iptr.getv()]].getv());
					registers[ops[iptr.getv()-1]].setv(registers[ops[iptr.getv()-1]].getv() ^ registers[ops[iptr.getv()]].getv());
					break;
				
			// -- Branching -- \\
				
				case 13:
					//cmp rX rY --> set flags
					var r1 = registers[ops[iptr.inc()]].getv();
					var r2 = registers[ops[iptr.inc()]].getv();
					
					//set flags
					flags.gt = (r1 > r2);
					flags.lt = (r1 < r2);
					flags.eq = (r1 == r2);
					break;
					
				case 14:
					//jmp to the location pointed to in the next instruction
					iptr.setv(ops[iptr.inc()] -1); //-1 since we will inc with the for loop, the memory never gets read so no state change
					break;
				case 15:
					//jet
					if(flags.eq == true) iptr.setv(ops[iptr.inc()] -1);
					break;
				case 16:
					//jlt
					if(flags.lt == true) iptr.setv(ops[iptr.inc()] -1);
					break;
				case 17:
					//jgt
					if(flags.gt == true) iptr.setv(ops[iptr.inc()] -1);
					break;
				case 18:
					//jz
					if(flags.zero == true) iptr.setv(ops[iptr.inc()] -1);
					break;
					
			// -- Other -- \\
			
				case 19:
					//rand rX = 0-255
					registers[ops[iptr.inc()]].setv(bios.generate_random());
					break;	
				case 20:
					//draw --> draws each pixel on the screen
					bios.screen.draw(memory.data);
					break;
					
				default:
					console.log("Unknown opcode '" + ops[iptr.getv()] + " at memory location '" + iptr.getv() + "', halting.");
					return;
			}
		}
	} catch(error) {
		console.log("An error occurred at command number '" + iptr.getv() + "' '" + ops[iptr.getv()] + "': ", error.message);
		console.log("Opcodes '" + ops + "'");
		console.log("Instruction Pointer '" + iptr + "'");
		return;
	}
}

function init(){
	// Setting up screen
	bios.screen.init();

	// Initialize memory with n locations
	memory.init(MAX_INSTRUCTIONS + bios.screen.memory_end);
	
	// Initialize registers (r1 ... n), and one instruction pointer [0]
	for (let i = 0; i < MAX_REGISTERS; i++) {
	    registers.push(Object.create(Register));
	    registers[i].setv(0, true);
	}
	console.log("To run code, create a list with isa.* elements and call run(). E.x. var program = [isa.NOP]; run(program);");
}

function test(){
	var code = [isa.NOP, isa.INC, 1, isa.INC, 2, isa.ADD, 1, 2, isa.DEC, 6, isa.DRAW, isa.HALT];
	for(var i = bios.screen.memory_start; i < bios.screen.memory_end; i++){
		//put random rgb on the screen
		memory.data[i+1] = bios.generate_random();
	}
	memory.load(0, code);
	run(memory.data);
	console.log("-- Registers\n", registers);
	console.log("-- Flags\n", flags);
	console.log("-- Memory\n", memory.data, memory.size);

}
init();
