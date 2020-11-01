exports.cardinalDirections = [
	{ x: -1, z: 0 }, // north
	{ x: 1, z: 0 }, // south
	{ x: 0, z: -1 }, // east
	{ x: 0, z: 1 } // west
];

exports.diagonalDirections = [
	{ x: -1, z: -1 },
	{ x: -1, z: 1 },
	{ x: 1, z: -1 },
	{ x: 1, z: 1 }
];

// make constants immutable
for (const key of Object.keys(exports)) {
	this[key] = Object.freeze(key);
}