var lgtv, Service, Characteristic;
var wol = require('wake_on_lan');
var ping = require('ping');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-webos3-light', 'webos3-light', webos3Accessory);
}

function webos3Accessory(log, config, api) {
  this.log = log;
  this.ip = config['ip'];
  this.name = config['name'];
  this.mac = config['mac'];
  this.url = 'ws://' + this.ip + ':3000';
  this.keyFile = config['keyFile'];
  this.connected = false;
  this.checkCount = 0;
  this.requestInterval = null;

  lgtv = require('lgtv2')({
    url: this.url,
    timeout: 5000,
    reconnect: 3000,
    keyFile: this.keyFile
  });
  
  var self = this;
  
  lgtv.on('connect', function() {
    self.log('webOS3 connected to TV');
    self.connected = true;
	
	requestInterval = setInterval(self.checkTVState.bind(self), 5000);
  });
  
  lgtv.on('close', function() {
    self.log('webOS3 disconnected from TV');
	if(requestInterval)
	  clearInterval(requestInterval);
  
    self.connected = false;
  });
  
  lgtv.on('error', function(error) {
    self.log('webOS3 error %s', error);
	if(requestInterval)
	  clearInterval(requestInterval);
  
    self.connected = false;
    //setTimeout(lgtv.connect(this.url), 5000);
  });
  
  lgtv.on('prompt', function() {
    self.log('webOS3 prompt for confirmation');
    self.connected = false;
  });
  
  lgtv.on('connecting', function() {
    self.log('webOS3 connecting to TV');
    self.connected = false;
  });

  this.service = new Service.Switch(this.name, "service");

  this.service
    .getCharacteristic(Characteristic.On)
    .on('get', this.getState.bind(this))
    .on('set', this.setState.bind(this));  
	
  this.accessoryInformationService = new Service.AccessoryInformation()
    .setCharacteristic(Characteristic.Manufacturer, 'LG Electronics Inc.')
    .setCharacteristic(Characteristic.Model, 'webOS TV')
    .setCharacteristic(Characteristic.SerialNumber, '-');
}

webos3Accessory.prototype.checkTVState = function() {
  var self = this;
  ping.sys.probe(this.ip, function(isAlive) {
    if (!isAlive) {
	  if(self.connected) {
	    self.service.getCharacteristic(Characteristic.On).setValue(false);
	  }
      self.connected = false;
    } else {
	  if(!self.connected) {
	    self.service.getCharacteristic(Characteristic.On).setValue(true);
	  }
      self.connected = true;
    }
    //self.log('webOS3 TV state: %s', self.connected ? "On" : "Off");
  });
}

webos3Accessory.prototype.checkWakeOnLan = function(callback) {
  if (this.connected) {
    this.checkCount = 0;
    return callback(null, true);
  } else {
    if (this.checkCount < 3) {
      this.checkCount++;
      lgtv.connect(this.url);
      setTimeout(this.checkWakeOnLan.bind(this, callback), 5000);
    } else {
      return callback(new Error('webOS3 wake timeout'));
      this.checkCount = 0;
    }
  }
}

webos3Accessory.prototype.getState = function(callback) {
  var self = this;
  return callback(null, self.connected);
}

webos3Accessory.prototype.setState = function(state, callback) {
  if (state) {
    if (!this.connected) {
      var self = this;
      wol.wake(this.mac, function(error) {
        if (error) return callback(new Error('webOS3 wake on lan error'));
        this.checkCount = 0;
        setTimeout(self.checkWakeOnLan.bind(self, callback), 5000);
      })
    } else {
      return callback(null, true);
    }
  } else {
    if (this.connected) {
      var self = this;
      lgtv.request('ssap://system/turnOff', function(err, res) {
        if (err) return callback(null, false);
        lgtv.disconnect();
        self.connected = false ;
        return callback(null, true);
      })
    } else {
      return callback(new Error('webOS3 is not connected'))
    }
  }
}

webos3Accessory.prototype.getServices = function() {
  return [
    this.service,
	this.accessoryInformationService
  ]
}

