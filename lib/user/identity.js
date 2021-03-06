define([
  '../core/transport/main',
  '../core/utilities/url',
  '../core/utilities/cookie'
], function (transport, url, cookie) {
  var identity = null,
      partnerInfo;

  function copyDiff (source, destination) {
    var k;

    for (k in source) {
      if (!source.hasOwnProperty(k)) {
        continue;
      }

      if (typeof source[k] === 'object' && typeof destination[k] === 'object') {
        destination[k] = copyDiff(source[k], destination[k]);

        continue;
      }

      if (source[k] !== destination[k]) {
        destination[k] = source[k];
      }
    }

    return destination;
  }

  function updateIdentityCache (newIdentity) {
    if (!identity) {
      identity = {};
    }

    copyDiff(newIdentity, identity);
  }

  return {
    /**
     * Login a user.
     *
     * @param {String}   role       Role to login for
     * @param {String}   username   username to login with
     * @param {String}   password   password to login with
     * @param {Function} callback   callback to call after authenticating
     */
    login: function (role, username, password, callback) {
      transport.connection.post('/user/login', {
        username: username,
        password: password,
        role    : role
      }, function (response) {
        if (response.error) {
          return callback(response);
        }

        updateIdentityCache(response);

        callback(null, response);
      });
    },

    /**
     * Set overriding (dominant) partner info. Can not be overriden via url or cookie.
     *
     * @param {string|int} p
     * @param {string}     pi
     */
    setPartnerInfo: function (p, pi) {
      partnerInfo = {partnerCode: p, partnerInfo: pi};
    },

    /**
     * Get the (calculated) partner info.
     *
     * @param {function} callback
     * @param {boolean} offline
     *
     * @returns {{partnerInfo:string, partnerCode: string}}
     */
    getPartnerInfo: function (callback, offline) {
      var info = partnerInfo || {},
          cookieValue;

      function returnInfo(error) {
        if (error) {
          return callback(error);
        }

        cookie.write('bridge_partner_info', info);

        callback(null, info);
      }

      // If there are no defaults: From url
      if (!info.partnerCode) {
        info.partnerCode = url.query('p');
      }

      if (!info.partnerInfo) {
        info.partnerInfo = url.query('pi');
      }

      // Next option: Get info from cookie
      if (!info.partnerCode || !info.partnerInfo) {
        cookieValue = cookie.read('bridge_partner_info');


        if (cookieValue && !info.partnerCode) {
          info.partnerCode = cookieValue.partnerCode;
        }

        if (cookieValue && !info.partnerInfo) {
          info.partnerInfo =  cookieValue.partnerInfo;
        }
      }

      // Get from identity. Absolute fallback.
      if (!offline && (!info.partnerCode || !info.partnerInfo)) {
        return this.getIdentity(function (error, identity) {

          if (error) {
            if (error.error === 'no_identity') {
              return returnInfo(null);
            }

            return returnInfo(error);
          }

          if (!info.partnerCode) {
            info.partnerCode = identity.partnerCode;
          }

          if (!info.partnerInfo) {
            info.partnerInfo = identity.partnerInfo;
          }

          return returnInfo(null);
        });
      }

      returnInfo(null);
    },

    /**
     * Login a user by hash.
     *
     * @param {String}          role        Role to login for
     * @param {String}          email       email address to login with
     * @param {String}          hash        password to login with
     * @param {String|Function} [username]  The username of the user, or callback
     * @param {Function}        callback    The callback if username was supplied
     */
    loginByHash: function (role, email, hash, username, callback) {
      var loginCredentials = {email: email, hash: hash, role: role};

      if (typeof username === 'function') {
        callback = username;
        username = null;
      }

      if (username) {
        loginCredentials['username'] = username;
      }

      transport.connection.post('/user/login-by-hash', loginCredentials, function (response) {
        if (response.error) {
          return callback(response);
        }

        updateIdentityCache(response);

        callback(null, response);
      });
    },

    /**
     * Check if the current client has an identity.
     *
     * @param {String}   role
     * @param {Function} callback The method called after getting checking the identity
     */
    hasIdentity: function (role, callback) {
      this.getIdentity(role, function (error, identity) {
        var hasIdentity;

        if (!error) {
          hasIdentity = identity && identity[role];

          return callback(null, hasIdentity);
        }

        if (error.error === 'no_identity') {
          return callback(null, false);
        }

        callback(error);
      });
    },

    /**
     * Check if a specific username is available.
     *
     * @param {string}   username
     * @param {function} callback
     */
    usernameAvailable: function (username, callback) {
      transport.connection.post('/user/username-available', {username: username}, function (response) {
        if (response.error) {
          return callback(response);
        }

        callback(null, response.available);
      });
    },

    /**
     * Destroy the identity.
     *
     * Force this method over ajax, because of socket policies and sessions.
     *
     * @param {Function} callback The method called after logging out.
     */
    logout: function (callback) {
      transport.adapter('ajax').get('/user/logout', callback);
    },

    /**
     * Get the username from a user ID.
     *
     * @param {String}   userId
     * @param {Function} callback The method called after getting the credits
     */
    getUsername: function (userId, callback) {
      transport.connection.get('/user/username/' + userId, function (response) {
        if (response.error) {
          return callback(response);
        }

        callback(null, response.username);
      });
    },

    /**
     * Get the User ID.
     *
     * @param {Function} callback The method called after getting the credits
     */
    getUserId: function (callback) {
      this.getIdentity(function (error, identity) {
        if (error) {
          return callback(error);
        }

        callback(null, identity.id);
      });
    },

    /**
     * Get the user's identity. Contains user information such as credit count.
     *
     * @param {String|function} [role]
     * @param {Function}        [callback]  The method called after getting the identity
     * @param {Boolean}         [force]     force update (don't use cached identity)
     */
    getIdentity: function (role, callback, force) {
      var requestUri = '/user/identity';

      if (typeof role === 'function') {
        callback = role;
        role = null;
      } else {
        requestUri += '/' + role;
      }

      if (identity && (!role||identity[role]) && !force) {
        return callback(null, identity);
      }

      transport.connection.get(requestUri, function (response) {
        if (response.error) {
          return callback(response);
        }

        updateIdentityCache(response);

        return callback(null, identity);
      });
    },

    /**
     * Update the given properties of a authenticated user
     *
     * @param {{}}       properties
     * @param {Function} callback   The method called after setting the new properties
     */
    update: function (properties, callback) {
      this.getIdentity(function (error, result) {
        if (error) {
          return callback(error);
        }

        transport.connection.put('/user/' + result.id, properties, function (response) {
          if (response.error) {
            return callback(response);
          }

          updateIdentityCache(response);

          callback(null, response);
        });
      });
    },

    /**
     * Verify user
     *
     * @param {*}          [user]    User instance or userId
     * @param {String}     type      Which email to verify, notificationEmail|email
     * @param {String}     hash      The hash
     * @param {Function}   callback  The callback called after the email is verified
     */
    verify: function (user, type, hash, callback) {

      if (typeof hash === 'function') {
        var self = this;

        return this.getIdentity(function(error, userIdentity) {
          if (error) {
            return callback(error);
          }

          self.verify(userIdentity.id, user, type, hash);
        });
      }

      if (typeof user === 'object') {
        user = user.id;
      }

      transport.connection.get('/user/' + user + '/verify/' + type + '?hash=' + hash, function (response) {
        if (response.error) {
          return callback(response);
        }

        callback(null, response);
      });
    },

    /**
     * Verify userEmail
     *
     * @param {*}          [userId]  User instance or userId
     * @param {String}     hash      The hash
     * @param {Function}   callback  The callback called after the userEmail is verified
     */
    verifyEmail: function (userId, hash, callback) {
      return this.verify(userId, 'email', hash, callback);
    },

    /**
     * Verify userNotificationEmail
     *
     * @param {*}          [userId]  User instance or userId
     * @param {String}     hash      The hash
     * @param {Function}   callback  The callback called after the userNotificationEmail is verified
     */
    verifyNotificationEmail: function (userId, hash, callback) {
      return this.verify(userId, 'notificationEmail', hash, callback);
    }
  };
});
