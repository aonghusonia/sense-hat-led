"use strict";

let rotation = 0;

const fs = require('fs'),
  glob = require('glob'),
  path = require('path'),
  rotateMatrix = require('rotate-matrix'),
  PNG = require('pngjs').PNG;

//find sense hat matrix framebuffer

let fb = '/dev/' +
  glob.sync('/sys/class/graphics/fb*')
  .filter(framebuffer => fs.existsSync(path.join(framebuffer, 'name')))
  .find(framebuffer => fs.readFileSync(path.join(framebuffer, 'name')).toString().trim() === 'RPi-Sense FB')
  .split('/')
  .reverse()[0];

// Decodes 16 bit RGB565 into list [R,G,B]
function unpack(n) {
  let r = (n & 0xF800) >> 11,
    g = (n & 0x7E0) >> 5,
    b = (n & 0x1F);
  return [r << 3, g << 2, b << 3];
}

// Encodes list [R, G, B] into 16 bit RGB565
function pack(rgb) {
  if (rgb.length != 3) throw new Error(`length = ${rgb.lenth} violates length = 3`);
  let r = (rgb[0] >> 3) & 0x1F,
    g = (rgb[1] >> 2) & 0x3F,
    b = (rgb[2] >> 3) & 0x1F;
  return (r << 11) + (g << 5) + b;
}

const pixMap0 = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20, 21, 22, 23],
  [24, 25, 26, 27, 28, 29, 30, 31],
  [32, 33, 34, 35, 36, 37, 38, 39],
  [40, 41, 42, 43, 44, 45, 46, 47],
  [48, 49, 50, 51, 52, 53, 54, 55],
  [56, 57, 58, 59, 60, 61, 62, 63]
];

const pixMap90 = rotateMatrix(pixMap0);

const pixMap180 = rotateMatrix(pixMap90);

const pixMap270 = rotateMatrix(pixMap180);

const pixMap = {
  0: pixMap0,
  90: pixMap90,
  180: pixMap180,
  270: pixMap270
};

function setRotation(r, redraw) {
  //Sets the LED matrix rotation for viewing, adjust if the Pi is upside
  //down or sideways. 0 is with the Pi HDMI port facing downwards

  //defaults
  if (r === undefined) r = 0;
  if (redraw === undefined) redraw = true;

  if (r in pixMap) {
    if (redraw) {
      let pixelList = getPixels();
      rotation = r;
      setPixels(pixelList);
    } else {
      rotation = r;
    }
  } else {
    throw new Error('Rotation must be 0, 90, 180 or 270 degrees');
  }
}

// Map (x, y) into rotated absolute byte position
function pos(x, y) {
  return pixMap[rotation][y][x] * 2;
}

// Returns a list of [R,G,B] representing the pixel specified by x and y
// on the LED matrix. Top left = 0,0 Bottom right = 7,7
function getPixel(x, y) {
  if (x < 0 || x > 7) throw new Error(`x=${x} violates 0 <= x <= 7`);
  if (y < 0 || y > 7) throw new Error(`y=${y} violates 0 <= y <= 7`);
  // Two bytes per pixel in fb memory, 16 bit RGB565
  const fd = fs.openSync(fb, 'r');
  // fread() supports no sync'd version, so read in all 8 x 8 x 2 bytes in one shot
  const buf = fs.readFileSync(fd);
  fs.closeSync(fd);
  return unpack(buf.readUInt16LE(pos(x, y)));
}

function setPixel(x, y, rgb) {
  if (x < 0 || x > 7) throw new Error(`x=${x} violates 0 <= x <= 7`);
  if (y < 0 || y > 7) throw new Error(`y=${y} violates 0 <= y <= 7`);
  rgb.forEach(col => {
    if (col < 0 || col > 255) throw new Error(`RGB color ${rgb} violates` +
      ` [0, 0, 0] < RGB < [255, 255, 255]`);
  });

  let fd = fs.openSync(fb, 'w');
  let buf = new Buffer(2);

  buf.writeUInt16LE(pack(rgb));
  fs.writeSync(fd, buf, 0, buf.length, pos(x, y));
  fs.closeSync(fd);
}

// Accepts a list containing 64 smaller lists of [R,G,B] pixels and
// updates the LED matrix. R,G,B elements must intergers between 0
// and 255
function setPixels(pixelList) {
  if (pixelList.length != 64) throw new Error('Pixel lists must have 64 elements');

  let buf = new Buffer(128); // 8 x 8 pixels x 2 bytes

  pixelList.forEach((rgb, index) => {
    rgb.forEach(col => {
      if (col < 0 || col > 255) throw new Error(`RGB color ${rgb} violates` +
        ` [0, 0, 0] < RGB < [255, 255, 255]`);
    });
    let y = Math.floor(index / 8);
    let x = index % 8;
    buf.writeUInt16LE(pack(rgb), pos(x, y));
  });

  let fd = fs.openSync(fb, 'w');
  fs.writeSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
}

//  Returns a list containing 64 smaller lists of [R,G,B] pixels
//  representing what is currently displayed on the LED matrix
function getPixels() {
  let pixelList = [];

  // Two bytes per pixel in fb memory, 16 bit RGB565
  const fd = fs.openSync(fb, 'r');
  // fread() supports no sync'd version, so read in all 8 x 8 x 2 bytes in one shot
  const buf = fs.readFileSync(fd);
  fs.closeSync(fd);

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      pixelList.push(unpack(buf.readUInt16LE(pos(x, y))));
    }
  }
  return pixelList;
}

function clear(rgb) {
  if (rgb === undefined) rgb = [0, 0, 0];

  let pixelList = [];
  for (let i = 0; i < 64; i++) {
    pixelList.push(rgb);
  }
  setPixels(pixelList);
}

// Flip LED matrix horizontal
function flipH(redraw) {
  if (redraw === undefined) redraw = true;

  let pixelList = getPixels(),
    flipped = [];
  while (pixelList.length) {
    flipped = flipped.concat(pixelList.splice(0, 8).reverse());
  }
  if (redraw) setPixels(flipped);
  return flipped;
}


// Flip LED matrix vertical

function flipV(redraw) {
  if (redraw === undefined) redraw = true;

  let pixelList = getPixels(),
    flipped = [];

  while (pixelList.length) {
    flipped = flipped.concat(pixelList.splice(pixelList.length - 8, 8));
  }
  if (redraw) setPixels(flipped);
  return flipped;
}

// Text assets

let textDict = {};

// Text asset files are rotated right through 90 degrees to allow blocks of
// 40 contiguous pixels to represent one 5 x 8 character. These are stored
// in a 8 x 640 pixel png image with characters arranged adjacently
// Consequently we must rotate the pixel map left through 90 degrees to
// compensate when drawing text

const textAssets = 'sense_hat_text';

loadTextAssets(`${__dirname}/${textAssets}.png`, `${__dirname}/${textAssets}.txt`);


// Internal. Builds a character indexed dictionary of pixels used by the
// show_message function below
function loadTextAssets(textImageFile, textFile) {
  let textPixels = loadImage(textImageFile, false);
  let loadedText = fs.readFileSync(textFile, 'utf8');

  for (let i = 0; i < loadedText.length; i++) {
    let start = i * 40; //each character is 8x5 pixels
    let end = start + 40;
    textDict[loadedText[i]] = textPixels.slice(start, end);
  }
}


// Internal. Trims white space pixels from the front and back of loaded
// text characters
function trimWhitespace(c) {
  let psum = (arr) => arr.reduce((a, b) => a.concat(b))
    .reduce((a, b) => a + b);

  if (psum(c) > 0) {
    let isEmpty = true;
    while (isEmpty) { // from front
      let row = c.slice(0, 8);
      isEmpty = psum(row) === 0;
      if (isEmpty) c.splice(0, 8);
    }

    isEmpty = true;
    while (isEmpty) { //from back
      let row = c.slice(-8);
      isEmpty = psum(row) === 0;
      if (isEmpty) c.splice(-8);
    }
  }
  return c;
}

// Accepts a path to an 8 x 8 image file and updates the LED matrix with
// the image
function loadImage(filePath, redraw) {
  if (redraw === undefined) redraw = true;

  try {
    fs.accessSync(filePath);
  } catch (e) {
    console.error(`${filePath} not found`);
  }


  //load file & convert to pixel list
  const buf = fs.readFileSync(filePath);
  const png = PNG.sync.read(buf);

  let pixelList = [];

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      let i = (png.width * y + x) << 2;
      pixelList.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
    }
  }

  if (redraw) setPixels(pixelList);
  return pixelList;
}


// Internal. Safeguards the character indexed dictionary for the
// showMessage function below
function getCharPixels(c) {
  if (c.length === 1 && c in textDict) {
    return textDict[c];
  } else {
    return textDict['?'];
  }
}


// Scrolls a string of text across the LED matrix using the specified
// speed and colours
function showMessage(textString, scrollSpeed, textColour, backColour) {
  // defaults
  if (scrollSpeed === undefined) scrollSpeed = 100;
  if (textColour === undefined) textColour = [255, 255, 255];
  if (backColour === undefined) backColour = [0, 0, 0];

  // We must rotate the pixel map left through 90 degrees when drawing
  // text, see loadTextAssets
  let previousRotation = rotation;
  rotation = (rotation + 90) % 360;

  let stringPadding = new Array(8).fill(backColour);
  let letterPadding = new Array(16).fill(backColour);

  let scrollPixels = [].concat(stringPadding);

  for (let c of textString) {
    scrollPixels = scrollPixels
      .concat(trimWhitespace(getCharPixels(c))
        //.concat(getCharPixels(c)
        .map(rgb => {
          if (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255) {
            return textColour;
          } else {
            return backColour;
          }
        }))
      .concat(letterPadding);
  }
  scrollPixels = scrollPixels.concat(stringPadding);

  let scrollLength = scrollPixels.length / 8;

  for (let i = 0; i < scrollLength - 8; i++) {
    let start = i * 8;
    let end = start + 64;
    setTimeout(() => setPixels(scrollPixels.slice(start, end)), i * scrollSpeed);
  }

  setTimeout(() => rotation = previousRotation, (scrollLength - 7) * scrollSpeed);
}


// Displays a single text character on the LED matrix using the specified
// colours
function showLetter(c, textColor, backColor) {
  // defaults
  if (textColor === undefined) textColor = [255, 255, 255];
  if (backColor === undefined) backColor = [0, 0, 0];

  if (c.length > 1) {
    throw new Error('Only one character may be passed into this method');
  }

  // We must rotate the pixel map left through 90 degrees when drawing
  // text, see loadTextAssets
  let previousRotation = rotation;
  rotation = (rotation + 90) % 360;

  let pixelList = new Array(8)
    .fill(backColor)
    .concat((getCharPixels(c)
      .map(rgb => {
        if (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255) {
          return textColor;
        } else {
          return backColor;
        }
      })))
    .concat(new Array(16).fill(backColor));

  setPixels(pixelList);
  rotation = previousRotation;
}


module.exports = {
  clear,
  setPixel,
  getPixel,
  setPixels,
  getPixels,
  flipH,
  flipV,
  setRotation,
  showMessage,
  showLetter,
  loadImage,
  get rotation() { return rotation },
  set rotation(r) {setRotation(r, true)}
};


// EOF
