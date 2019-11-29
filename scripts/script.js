// Connecting to ROS
// -----------------  
let hasGP = false;
let repGP;
let joyPublisher = null;
let wheelsListener = null;
let cameraListener = null;
let ros = null;
let obj = {joy: [], wheels_cmd_executed: []};
let files = [];
let robotName = null;
let output = null;
let startDrivingButton = null;
let stopDrivingButton = null;
let startLoggingButton = null;
let allowLogging = false;
let statusText = null;

/**
 * Once the document is ready get html elements and assign it to variables.
 */
$(document).ready(function() {

  output = document.getElementById('output');
  startDrivingButton = document.getElementById("startDrivingButton");
  stopDrivingButton = document.getElementById("stopDrivingButton");
  startLoggingButton = document.getElementById("startLoggingButton");
  statusText = document.getElementById("status");
  /**
   * Check for controllers and setup an interval for constant checks for controller
   */
  if(canGame()) {
      var prompt = "To begin using your gamepad, connect it and press any button!";
      $("#gamepadPrompt").text(prompt);

      $(window).on("gamepadconnected", function() {
          hasGP = true;
          $("#gamepadPrompt").html("Gamepad connected!");
          console.log("connection event");
          repGP = window.setInterval(onGamepadStateChanged, 30);
      });

      $(window).on("gamepaddisconnected", function() {
          console.log("disconnection event");
          $("#gamepadPrompt").text(prompt);
          window.clearInterval(repGP);
      });

      //setup an interval for Chrome
      var checkGP = window.setInterval(function() {
          console.log('checkGP');
          if(navigator.getGamepads()[0]) {
              if(!hasGP) $(window).trigger("gamepadconnected");
              window.clearInterval(checkGP);
          }
      }, 500);
  }
});
/**
 * Set up the roslibjs
 * ros variable will connect to the websocket container of the duckiebot
 * ROSLIB.Topic creates a new topic.
 */
function setupRoslib() {
  startDrivingButton.disabled = true;
  stopDrivingButton.disabled = false;
  startLoggingButton.disabled = false;
  robotName = document.getElementById("robotnameText").value;
  if (robotName != null || robotName != '') {
    ros = new ROSLIB.Ros({
      url : 'ws://' + robotName + '.local:9001'
    });
    
    ros.on('connection', function() {
      console.log('Connected to websocket server.');
    });
    
    ros.on('error', function(error) {
      console.log('Error connecting to websocket server: ', error);
    });
    
    ros.on('close', function() {
      console.log('Connection to websocket server closed.');
    });
    
    // Publishing a Topic
    // ------------------
    
    joyPublisher = new ROSLIB.Topic({
      ros : ros,
      name : '/' + robotName + '/joy',
      messageType : 'sensor_msgs/Joy'
    });
  
    wheelsListener = new ROSLIB.Topic({
      ros : ros,
      name : '/' + robotName + '/wheels_driver_node/wheels_cmd_executed',
      messageType : 'duckietown_msgs/WheelsCmdStamped'
    });
    cameraListener = new ROSLIB.Topic({
      ros : ros,
      name : '/' + robotName + '/camera_node/image/compressed',
      messageType : 'sensor_msgs/CompressedImage'
    });
  
    wheelsListener.subscribe(function(message) {
      if (allowLogging) {
        var timestamp = parseInt(message.header.stamp.secs.toString() + message.header.stamp.nsecs.toString().substring(0, 3));
        obj.wheels_cmd_executed.push({timestamp: timestamp, vel_left: message.vel_left, vel_right: message.vel_right});
      }
    });
    cameraListener.subscribe(function(message) {
      if(allowLogging) {
        let timestamp = parseInt(message.header.stamp.secs.toString() + message.header.stamp.nsecs.toString().substring(0, 3));
        let name = timestamp + '.jpeg';
        let file = new File([base64toBlob(message.data)], name);
        files.push(file);
      }
    });
  }
}
/**
 * Converts base64(string) data to Blob object
 * @param {Base64} base64Data 
 * @param {} contentType 
 */
function base64toBlob(base64Data, contentType='image/jpeg') {
  contentType = contentType || '';
  var sliceSize = 1024;
  var byteCharacters = atob(base64Data);
  var bytesLength = byteCharacters.length;
  var slicesCount = Math.ceil(bytesLength / sliceSize);
  var byteArrays = new Array(slicesCount);

  for (var sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
      var begin = sliceIndex * sliceSize;
      var end = Math.min(begin + sliceSize, bytesLength);

      var bytes = new Array(end - begin);
      for (var offset = begin, i = 0; offset < end; ++i, ++offset) {
          bytes[i] = byteCharacters[offset].charCodeAt(0);
      }
      byteArrays[sliceIndex] = new Uint8Array(bytes);
  }
  return new Blob(byteArrays, { type: contentType });
}

var stopMessage = new ROSLIB.Message({
  axes : [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  buttons : [0,0,0,0,0,0,0,0,0,0,0,0]
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * publishes a message to the topic to make the robot move.
 * @param {float} forward 
 * @param {float} angular 
 */
function move(forward, angular) {
  if (joyPublisher != null) {
    var msg = new ROSLIB.Message({
      axes : [0.0, -forward, 0.0, -angular, 0.0, 0.0, 0.0, 0.0],
      buttons : [0,0,0,0,0,0,0,0,0,0,0,0]                                                                                                                             
    });
    joyPublisher.publish(msg);
    if(allowLogging) {
      var d = new Date();
      var t = d.getTime();
      obj.joy.push({timestamp: t, x: forward, y: angular});
    }
  }
}
/**
 * clears objects and allows logging.
 */
function startLogging() {
  obj = {joy: [], wheels_cmd_executed: []};
  files = [];
  if(allowLogging) {
    allowLogging = false;
    console.log("Logging stopped");
    statusText.innerText="Stopped";
    statusText.style.backgroundColor="red";
    startLoggingButton.innerText="Start Logging";
  } else {
    allowLogging = true;
    console.log("Logging started");
    statusText.innerText="Started";
    statusText.style.backgroundColor="green";
    startLoggingButton.innerText="Stop Logging";
  }
}
/**
 * stops driving, converts the data to a zip and downloads it.
 */
function stopDriving() {
  if (joyPublisher !== null) {
    stopDrivingButton.disabled = true;
    wheelsListener.unsubscribe();
    cameraListener.unsubscribe();
    joyPublisher.publish(stopMessage);
    joyPublisher = null;

    if (allowLogging) {
      var zip = new JSZip();
    
      var folder = zip.folder("images");
      
      const now = new Date();
      const millisSinceEpoch = now.getTime();
      zip.file(robotName + '_' + millisSinceEpoch + '_log.json', new Blob([JSON.stringify(obj, null, 2)], {type : 'application/json'}));
      
      for (let f of files) {
        folder.file(f.name, f);
      }
      output.appendChild(document.createTextNode("Zipping and saving... this will take an eternity."));
      zip.generateAsync({type:"blob"}).then(function(content) {
        saveAs(content, "yeet.zip");
      }).then(function() {
        output.content = null;
        startDrivingButton.disabled = false;
      });
    } else {
      startDrivingButton.disabled = false;
    }
  }
  console.log("Driving stopped!");
}
/** 
 * returns gamepads if any are connected 
 */
function canGame() {
    return "getGamepads" in navigator;
}
/**
 * Callback method
 * calls the move() method and passes the gamepads axes
 */
function onGamepadStateChanged() {
    var gp = navigator.getGamepads()[0];
    move(gp.axes[1], gp.axes[0]);
}