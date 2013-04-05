
var app = angular.module('blockers', []);

app.run(function($rootScope, sessionService, bugzillaService) {
    $rootScope.ready = false;
    $rootScope.loggedIn = false;

    $rootScope.$on("BugzillaLoginSuccess", function(event, args) {
        sessionService.setCredentials(args.credentials);
        $rootScope.ready = true;
        $rootScope.loggedIn = true;
    });

    $rootScope.$on("BugzillaLogoutSuccess", function() {
        sessionService.clearCredentials();
        $rootScope.loggedIn = false;
    });

    var credentials = sessionService.getCredentials();
    if (credentials) {
        bugzillaService.login(credentials.username, credentials.password);
    } else {
        $rootScope.ready = true;
    }
});

app.factory('preferencesService', function () {
    var sharedPreferencesService = {};

    sharedPreferencesService.setUsername = function(username) {
        localStorage.setItem("username", username);
    };

    sharedPreferencesService.getUsername = function() {
        return localStorage.getItem("username");
    };

    return sharedPreferencesService;
});

app.factory('sessionService', function () {
    return {
        setCredentials: function (credentials) {
            sessionStorage.setItem("credentials_username", credentials.username);
            sessionStorage.setItem("credentials_password", credentials.password);
        },
        getCredentials: function () {
            var c = {username: sessionStorage.getItem("credentials_username"), password: sessionStorage.getItem("credentials_password")};
            if (c.username && c.password) {
                return c;
            } else {
                return undefined;
            }
        },
        clearCredentials: function () {
            sessionStorage.removeItem("credentials_username");
            sessionStorage.removeItem("credentials_password");
        }
    };
});

app.factory('bugzillaService', function ($rootScope, $http, sessionService)
{
    var sharedBugzillaService = {};

    sharedBugzillaService.cleanupBug = function(bug) {
        bug.creation_time = Date.parse(bug.creation_time);
        //bug.last_change_time = Date.parse(bug.last_change_time);

        bug.age = Math.floor((Date.now() - bug.creation_time) / (24 * 60 * 60 * 1000));

        bug.ageLabel = "default";
        if (bug.age < 7) {
            bug.ageLabel = "success";
        } else if (bug.age < 28) {
            bug.ageLabel = "warning";
        } else {
            bug.ageLabel = "important";
        }
    };

    sharedBugzillaService.login = function BugzillaService_login(username, password)
    {
        if (username === "nobody@mozilla.org") {
            sharedBugzillaService.credentials = {username: username, password: password};
            $rootScope.$broadcast("BugzillaLoginSuccess", {credentials:{username:username,password:password}});
            return;
        }

        var params = {
            username: username,
            password: password
        };

        $http({url: "https://api-dev.bugzilla.mozilla.org/latest/bug/38", method:"GET", params:params})
            .success(function(/*data*/) {
                sharedBugzillaService.credentials = {username: username, password: password};
                $rootScope.$broadcast("BugzillaLoginSuccess", {credentials:{username:username,password:password}});
            })
            .error(function(/*data, status, headers, config*/){
                $rootScope.$broadcast("BugzillaLoginFailure");
            });
    };

    sharedBugzillaService.logout = function()
    {
        sharedBugzillaService.credentials = undefined;
        sessionService.clearCredentials();
        $rootScope.$broadcast("BugzillaLogoutSuccess");
    };

    sharedBugzillaService.isAnonymous = function()
    {
        return sharedBugzillaService.credentials && sharedBugzillaService.credentials.username === "nobody@mozilla.org";
    };

    sharedBugzillaService.getBugs = function(options)
    {
        const fieldsThatNeedMultipleParameters = ['product', 'component', 'status', 'resolution'];

        var query = "";

        var appendParameter = function(q, name, value) {
            if (q.length > 0) {
                q += "&";
            }
            return q + encodeURIComponent(name) + "=" + encodeURIComponent(value);
        };

        for (var optionName in options) {
            if (options.hasOwnProperty(optionName)) {
                switch (optionName) {
                    case "advanced": {
                        _.each(options["advanced"], function (t, i) {
                            query = appendParameter(query, "field" + i + "-0-0", t[0]);
                            query = appendParameter(query, "type" + i + "-0-0", t[1]);
                            if (t.length == 3) {
                                query = appendParameter(query, "value" + i + "-0-0", t[2]);
                            }
                        });
                        break;
                    }
                    default: {
                        if (options[optionName] instanceof Array) {
                            if (fieldsThatNeedMultipleParameters.indexOf(optionName) != -1) {
                                _.each(options[optionName], function (value) {
                                    query = appendParameter(query, optionName, value);
                                });
                            } else {
                                query = appendParameter(query, optionName, options[optionName].join(','));
                            }
                        } else {
                            query = appendParameter(query, optionName, options[optionName]);
                        }
                    }
                }
            }
        }

        if (sharedBugzillaService.credentials && sharedBugzillaService.credentials.username !== "nobody@mozilla.org") {
            query = appendParameter(query, "username", sharedBugzillaService.credentials.username);
            query = appendParameter(query, "password", sharedBugzillaService.credentials.password);
        }

        return $http({url: "https://api-dev.bugzilla.mozilla.org/latest/bug?" + query, method:"GET"});
    };

    sharedBugzillaService.isLoggedIn = function() {
        return this.credentials != undefined;
    };

    return sharedBugzillaService;
});

app.controller('ApplicationController', function() {
});

app.controller('SigninController', function ($scope, $rootScope, $http, bugzillaService, preferencesService) {
    $scope.bugzillaService = bugzillaService;
    $scope.error = undefined;

    $scope.username = "";
    $scope.password = "";
    $scope.rememberMe = undefined;

    if (preferencesService.getUsername() != "") {
        $scope.username = preferencesService.getUsername();
        $scope.rememberMe = true;
    }

    $scope.signin = function() {
        $scope.error = undefined;
        bugzillaService.login($scope.username, $scope.password);
    };

    $scope.anonymous = function() {
        $scope.error = undefined;
        bugzillaService.login("nobody@mozilla.org", undefined);;
    };

    $scope.$on("BugzillaLoginSuccess", function() {
        if ($scope.rememberMe) {
            preferencesService.setUsername($scope.username);
        } else {
            preferencesService.setUsername("");
            $scope.username = "";
        }
        $scope.password = "";
    });
});

app.controller('PageController', function ($scope, $http, bugzillaService) {
    $scope.bugzillaService = bugzillaService;
    $scope.loading = true;
    $scope.username = undefined;

    $scope.bugs = [];
    $scope.sites = {};
    $scope.projectReviewBugs = [];
    $scope.blockingBugs = {};

    $scope.$on("BugzillaLoginSuccess", function(event, args) {
        $scope.username = args.credentials.username;
        $scope.reload();
    });

    $scope.$on("BugzillaLogoutSuccess", function() {
        $scope.loading = true;
        $scope.bugs = [];
    });

    $scope.logout = function() {
        $scope.bugzillaService.logout();
    };

    $scope.filterName = "all";
    $scope.sortName = "age";

    $scope.filter = function(what) {
        $scope.filterName = what;

        switch (what) {
            case "all": {
                $scope.bugs = $scope.allBugs;
                break;
            }
            case "mine": {
                $scope.bugs = _.filter($scope.allBugs, function(bug) {return bug.assigned_to.name === $scope.username;});
                break;
            }
            case "assigned": {
                $scope.bugs = _.filter($scope.allBugs, function(bug) {
                    return bug.assigned_to.name !== "nobody@mozilla.org" && bug.assigned_to.name !== "nobody";
                });
                break;
            }
            case "unassigned": {
                $scope.bugs = _.filter($scope.allBugs, function(bug) {
                    return bug.assigned_to.name === "nobody@mozilla.org" || bug.assigned_to.name === "nobody";
                });
                break;
            }
        }

        $scope.sort($scope.sortName);
    };

    $scope.sort = function(what) {
        $scope.sortName = what;

        switch (what) {
            case "age": {
                $scope.bugs = _.sortBy($scope.bugs, function(bug) { return bug.age; }).reverse();
                break;
            }
            case "assignee": {
                $scope.bugs = _.sortBy($scope.bugs, function(bug) { return bug.assigned_to.name; });
                break;
            }
        }
    };

    $scope.reload = function()
    {
        // First we get the project review bugs

        var options = {
            product: "mozilla.org",
            component: "Security Assurance: Review Request",
            status: ["UNCONFIRMED", "NEW", "ASSIGNED"],
            include_fields:"id,creation_time,summary,status,assigned_to"
        };

        bugzillaService.getBugs(options)
            .success(function(data) {
                $scope.allBugs = data.bugs;
                $scope.loading = false;

                _.each($scope.allBugs, function(bug) {
                    bugzillaService.cleanupBug(bug);
                });

                $scope.sort('age');
                $scope.filter(bugzillaService.isAnonymous() ? 'all' : 'mine');
            })
            .error(function (data, status) {
                console.log("Error getting bugs", data, status);
            });
    };
});
