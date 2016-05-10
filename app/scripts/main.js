"use strict";

const loginUrl = "http://localhost:3000/auth/logIn";
const searchUrl = "http://localhost:3000/perf/search";
const statsUrl = "http://localhost:3000/perf/getIntervalStats";
const avgUrl = "http://localhost:3000/perf/sessionAverages";
const roomUrl = "http://localhost:3000/perf/getRoomInfo";
const minFps = 0;
const maxFps = 60;
const currentInfo = {"session": "None", "user": "None"};
const margin = {top: 5, right: 50, bottom: 20, left: 50},
  width = 960 - margin.left - margin.right,
  height = 500 - margin.top - margin.bottom;

let table = {};
let svg = {};
let legend = {};
let graphData = [];
let sessionData = {};
let roomInfo = {};
let avgData = {};
let toolTip = null;
let uName = null;
let uToken = null;
let attempts = 0;

const rc = d3.scale.ordinal();
const x = d3.time.scale()
    .range([0, width]);
const y = d3.scale.linear()
    .range([height, 0]);
const yMem = d3.scale.linear()
    .range([height, 0]);
const xAxis = d3.svg.axis()
    .scale(x)
    .orient("bottom");
const yAxis = d3.svg.axis()
    .scale(y)
    .orient("left");
const yAxisRight = d3.svg.axis()
    .scale(yMem)
    .orient("right");
const line = d3.svg.line()
    .x(d => {
      return x(d.ts);
    })
    .y(d => {
      return y(d.fpsAvg);
    });
const memLine = d3.svg.line()
    .x(d => {
      return x(d.ts);
    })
    .y(d => {
      return yMem(d.memoryUsed);
    });
const formatDate = d3.time.format("%Y-%m-%d %H:%M:%S");

function getTitleText() {
  if (!currentInfo) {
    return "Sample Chart";
  }
  else {
    return `User: ${currentInfo.user} - Session: ${currentInfo.session}`;
  }
}

function toolTipText(interval) {
  let t = "";
  interval.events.forEach(e => {
    t +=  `Event: ${e.type}  Offset: ${e.offset} <br/>`;
  });
  return t;
}

function roomSuccess(data) {
  roomInfo = JSON.parse(data).rooms;
  $.each(roomInfo, (i, room) => {
    $("#room").append($("<option>", {
        value: room.id,
        text: room.name,
    }));
  });
}

function grabParams() {
  const params = {};
  $("#queryForm :input").serializeArray().map(x => params[x.name] = x.value ? x.value : null);

  if (params.deviceType === "0") {
    params.deviceType = null;
  }
  if (params.buildVersion === "0") {
    params.buildVersion = null;
  }
  if (params.room === "0") {
    params.room = null;
  }

  return params;
}

function refreshTable() {
	table.clear();
  if (sessionData.sessions) {
    sessionData.sessions.forEach(session => {
      table.row.add([
        session.userId,
        session.deviceType,
        session.platform === 8 ? "iOS" : session.platform === 11 ? "Android" : "Unknown",
        session.startTime,
        session.id,
        session.roomDefId,
        session.buildType === 0 ? "Debug" : "Release",
      ]);
    });
  }
	table.draw();
}

function getMemoryRange() {
  // Default to arbitrary range for empty charts.
  if (!graphData || graphData.length === 0) {
    return [0, 500];
  }

  const max = d3.max(graphData, d => {
    return d.memoryUsed;
  });
  return [0, max + 20];
}

function setUpChart() {
  if (!graphData) {
    return;
  }

	x.domain(d3.extent(graphData, d => {
    return d.ts;
  }));
  y.domain([minFps, maxFps]);
  yMem.domain(getMemoryRange());

  svg.append("g")
      .attr("class", "background")
      .attr("id", "bg");

  svg.append("g")
      .attr("class", "x axis")
      .attr("transform", `translate(0, ${height})`)
      .call(xAxis);

  svg.append("g")
      .attr("class", "y axis fps")
      .call(yAxis)
    .append("text")
      .attr("transform", `rotate(-90),translate(${(-height / 2) + 30}, -50)`)
      .attr("y", 6)
      .attr("dy", ".71em")
      .style("text-anchor", "end")
      .text("FPS (avg)");
  svg.select(".y.axis.fps")
    .append("rect")
      .attr("transform", `rotate(-90),translate(${(-height / 2) + 35}, -50)`)
      .attr("y", 6)
      .attr("width", 10)
      .attr("height", 10)
      .style("fill", "steelblue");

  svg.append("g")
      .attr("class", "y axis mem")
      .attr("transform", `translate(${width}, 0)`)
      .call(yAxisRight)
    .append("text")
      .attr("transform", `rotate(90),translate(${(height / 2) + 30}, -50)`)
      .attr("y", 6)
      .attr("dy", ".71em")
      .style("text-anchor", "end")
      .text("Memory");

  svg.select(".y.axis.mem")
    .append("rect")
      .attr("transform", `rotate(90),translate(${(height / 2) + 35}, -50)`)
      .attr("y", 6)
      .attr("width", 10)
      .attr("height", 10)
      .style("fill", "red");

  svg.append("g")
    .attr("transform", `translate(${width / 2}, -16)`)
    .append("text")
    .attr("id", "title")
    .attr("dy", ".71em")
    .attr("font-size", 14)
    .style("text-anchor", "middle")
    .text(getTitleText());

  toolTip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", "0");

  svg.append("path")
      .attr("class", "fps line")
      .attr("d", line(graphData));

  svg.append("path")
      .attr("class", "mem line")
      .style("stroke", "red")
      .style("stroke-width", "1")
      .attr("d", memLine(graphData));

  // legend stuff
  legend.append("g")
      .attr("class", "lbg");
}

function getRoomChanges() {
  if (!graphData || !graphData.length){
    return [];
  }
  const rc = [];
  let cur = {"enter": graphData[0], "exit": null};
  let i = 1;
  let next = null;
  for (i; i < graphData.length; i++) {
    next = graphData[i];
    if (cur.enter.roomDefId !== next.roomDefId) {
      cur.exit = next.ts;
      rc.push(cur);
      cur = {"enter": next, "exit": null};
    }
  }
  if (cur.exit === null) {
    cur.exit = next.ts;
    rc.push(cur);
  }
  return rc;
}

function getRelevantRooms() {
  if (!graphData || !graphData.length){
    return [];
  }

  const rc = getRoomChanges();
  const rooms = [];
  rc.forEach(r => {
    if (rooms.indexOf(r.enter.roomDefId) === -1) {
      rooms.push(r.enter.roomDefId);
    }
  });
  return rooms;
}

function genRoomColors(n) {
  const c = randomColor({
    luminosity: "bright",
    count: n,
  });

  // Set every other color to the compliment of its predecessor so the
  // amount of similar neighbors is reduced.
  let prev = "";
  for (let i = 1; i < n; i += 2) {
    if (i >= n) {
      break;
    }
    prev = `0x${c[i - 1].slice(-6)}`;
    c[i] = `#${(`000000${("0xFFFFFF" ^ prev).toString(16)}`).slice(-6)}`;
  }
  return c;
}

function renderEventMarkers() {
  svg.selectAll(".event").remove();
  svg.selectAll(".event")
    .data(graphData.filter((d, i) => {
        return d.numEvents > 0;
    }))
    .enter()
    .append("circle")
    .attr("class", "event")
    .attr("r", 3)
    .attr("cx", d => {
      return x(d.ts);
    })
    .attr("cy", d => {
      return y(d.fpsAvg);
    })
    .on("mouseover", d => {
      toolTip.transition()
        .duration(100)
        .style("opacity", .9);
      toolTip.html(toolTipText(d))
      .style("left", `${d3.event.pageX}px`)
      .style("top", `${d3.event.pageY - 28}px`);
    })
    .on("mouseout", d => {
      toolTip.transition()
      .duration(200)
      .style("opacity", 0);
    });
}

function calcRowIdx(index, numCols) {
  let r = 0;
  let c = index;
  while (c >= numCols) {
    c -= numCols;
    r++;
  }
  return r;
}

function renderLegend() {
  const rooms = getRelevantRooms();
  legend.select(".lbg").selectAll(".marker").remove();
  const ls = legend.select(".lbg").selectAll(".marker")
    .data(rooms)
    .enter()
    .append("g")
      .attr("class", "marker")
      .attr("transform", (d, i) => {
        return `translate(${(width / 5) * (i % 5)}, ${40 * calcRowIdx(i, 5)})`;
      })
      .on("mouseover", d => {
        svg.selectAll(`.room.r${d}`).transition()
          .duration(500)
          .style("opacity", .3);
      })
      .on("mouseout", d => {
        svg.selectAll(`.room.r${d}`).transition()
          .duration(300)
          .style("opacity", .1);
      });
  ls.append("rect")
      .attr("id", d => {
        return `lb${d}`;
      })
      .attr("width", 15)
      .attr("height", 15)
      .style("stroke", "#000000")
      .style("stroke-width", 1)
      .style("fill", d => {
        return rc(d);
      })
      .style("opacity", .3);

  ls.append("text")
    .attr("transform", "translate(85, 0)")
    .attr("y", 6)
    .attr("dy", ".71em")
    .style("text-anchor", "end")
    .text(d => {
      return d;
    });
}

function updateChart() {
  x.domain(d3.extent(graphData, d => {
    return d.ts;
  }));
  yMem.domain(getMemoryRange());
  svg.select(".x.axis")
      .transition().duration(500).ease("sin-in-out")
      .call(xAxis);

  svg.select(".y.axis.mem")
      .transition().duration(500).ease("sin-in-out")
      .call(yAxisRight);

  const rr = getRelevantRooms();
  rc.domain(rr);
  rc.range(genRoomColors(rr.length));
  svg.select("#bg").selectAll(".room").remove();
  svg.select("#bg").selectAll(".room")
    .data(getRoomChanges())
    .enter().append("rect")
    .attr("class", d => {
      return `room r${d.enter.roomDefId}`;
    })
    .attr("x", d => {
      return x(d.enter.ts);
    })
    .attr("y", 0)
    .attr("width", d => {
      return (x(d.exit) - x(d.enter.ts));
    })
    .attr("height", height)
    .style("fill", d => {
      return rc(d.enter.roomDefId);
    })
    .style("opacity", .1);

  svg.select("#title").text(getTitleText());

  const vg = svg.transition();
  vg.select(".fps.line")
    .duration(100).ease("sin-in-out")
    .attr("d", line(graphData));
  vg.select(".mem.line")
    .duration(100).ease("sin-in-out")
    .attr("d", memLine(graphData));

  renderEventMarkers();
  renderLegend();
}

function updateSelectedAggregates() {
  const avgs = [];
  const selectedIds = table.rows({selected: true}).data().pluck(4);
  let i = 0;
  let j = 0;
  for (i; i < selectedIds.length; i++){
    for (j = 0; j < avgData.averages.length; j++){
      if (selectedIds[i] === avgData.averages[j].id) {
        avgs.push(avgData.averages[j]);
        break;
      }
    }
  }
  $("#saCount").html(selectedIds.length);
  let totalAvg = d3.mean(avgs, a => {
    return a.fps;
  });
  $("#saFps").html(Math.floor(totalAvg));

  totalAvg = d3.mean(avgs, a => {
    return a.memory;
  });
  $("#saMem").html(Math.floor(totalAvg));
}

function getFail(j, status, error) {
	console.log(j);
	console.log(status);
	console.log(error);
}

function setUpRooms() {
  const jstr = JSON.stringify({
		"username": uName,
		"authToken": uToken,
    "params": {},
  });
  $.ajax({
    "type": "POST",
    "url": roomUrl,
    "data": jstr,
  }).done((data, status, jqXHR) => {
    roomSuccess(data, status, jqXHR);
  }).fail((jqXHR, textStatus, errorThrown) => {
    getFail(jqXHR, textStatus, errorThrown);
	});
}

function setUp() {
  setUpRooms();

  svg = d3.select("#gc")
    .append("svg")
      .attr("class", "chart")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform",
          `translate(${margin.left}, ${margin.top})`);

  legend = d3.select("#gc")
    .append("svg")
      .attr("class", "legend")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height)
      .append("g")
        .attr("transform",
          `translate(${margin.left}, ${margin.top})`);

  setUpChart();
}

function authenticate(c) {
  if (!uName || !uToken) {
    if (c > 0) {
      $("#vText").addClass("error").html("Login Failed");
    }
    else {
      $("#vm").show();
    }
  }
  else {
    $("#vText").removeClass("error").addClass("success").html("Success!");
    $("#vm").hide(1000);
    setUp();
  }
}

// Callbacks
function getAvgSuccess(data, status, j){
	avgData = JSON.parse(data);
	if (avgData) {
    $("#taCount").html(avgData.averages.length);
    let totalAvg = d3.mean(avgData.averages, a => {
      return a.fps;
    });
    $("#taFps").html(Math.floor(totalAvg));

    totalAvg = d3.mean(avgData.averages, a => {
      return a.memory;
    });
    $("#taMem").html(Math.floor(totalAvg));
	}
}

function getAverages() {
  const params = sessionData.sessions.map(e => {
    return { "id": e.id };
  });
	const jstr = JSON.stringify({
		"username": uName,
		"authToken": uToken,
		"params": {
      "sessions": params,
		}});

	$.ajax({
    "type": "POST",
    "url": avgUrl,
    "data": jstr,
  }).done((data, status, jqXHR) => {
    getAvgSuccess(data, status, jqXHR);
  }).fail((jqXHR, textStatus, errorThrown) => {
    getFail(jqXHR, textStatus, errorThrown);
	});
}

function getSuccess(data, status, j){
	sessionData = JSON.parse(data);
	if (sessionData) {
		refreshTable();
    getAverages();
	}
}

function dataRequestCallback(wasSuccess, data, error, status) {
  if (wasSuccess) {
    graphData = JSON.parse(data).intervals.map(e => {
        e.ts = formatDate.parse(e.ts);
        return e;
      });
    updateChart();
    updateSelectedAggregates();
  }
}

function handleLogin() {
  const params = {};
  $("#vForm :input").serializeArray().map(x => params[x.name] = x.value ? x.value : null);
  const jstr = JSON.stringify({
    "params": {
      "username": params.lName,
      "password": params.lPass,
    },
  });

  $.ajax({
    "type": "POST",
    "url": loginUrl,
    "data": jstr,
  }).done((data, status, jqXHR) => {
    const d = JSON.parse(data);
    uName = d.username;
    uToken = d.authToken;
    authenticate(0);
  }).fail((jqXHR, textStatus, errorThrown) => {
    uName = null;
    uToken = null;
    authenticate(++attempts);
  });
}

function handleSearch() {
  const params = grabParams();
	const jstr = JSON.stringify({
		"username": uName,
		"authToken": uToken,
		"params": {
      "constraints": {
        "user": params.username,
        "deviceType": params.deviceType,
        "platform": params.platform,
        "buildType": params.buildType,
        "buildVersion": params.buildVersion,
        "startTime": params.startTime,
        "endTime": params.endTime,
        "roomDefId": params.room,
      },
		}});

	$.ajax({
    "type": "POST",
    "url": searchUrl,
    "data": jstr,
  }).done((data, status, jqXHR) => {
    getSuccess(data, status, jqXHR);
  }).fail((jqXHR, textStatus, errorThrown) => {
    getFail(jqXHR, textStatus, errorThrown);
	});
}

function requestSessionData(id, user) {
  const jstr = JSON.stringify({
		"username": uName,
		"authToken": uToken,
		"params": {
        "sessionId": id,
		}});

	$.ajax({
    "type": "POST",
    "url": statsUrl,
    "data": jstr,
  }).done((data, status, jqXHR) => {
    currentInfo.session = id;
    currentInfo.user = user;
    dataRequestCallback(true, data);
  }).fail((jqXHR, textStatus, errorThrown) => {
    dataRequestCallback(false, null, errorThrown, textStatus);
	});
}

function handleTableSelect(e, dt, type, indices) {
  let selectedIds = null;
  let selectedUsers = null;
  if (type === "row") {
    selectedIds = table.rows(indices).data().pluck(4)[0];
    selectedUsers = table.rows(indices).data().pluck(0)[0];
    requestSessionData(selectedIds, selectedUsers);
  }
}
function handleTableDeSelect(e, dt, type, indices) {
  updateSelectedAggregates();
}

$(document).ready(() => {
    $("#vForm :input").on("keypress", e => {
      if (e.which === 13) {
        e.preventDefault();
        handleLogin();
      }
    });
    $("#lButton").on("click", () => {
      handleLogin();
    });

    $("#startTime").datetimepicker({
      dateFormat: "yy-mm-dd",
      timeFormat: "HH:mm:ss",
    });
    $("#endTime").datetimepicker({
      dateFormat: "yy-mm-dd",
      timeFormat: "HH:mm:ss",
    });
		$("#searchButton").on("click", () => {
			handleSearch();
		});
    table = $("#results").DataTable({
        searching: false,
        select: true,
    });

    table.on("select", handleTableSelect);
    table.on("deselect", handleTableDeSelect);

    authenticate(attempts);
});