"use strict";

const loginUrl = "http://localhost:3000/auth/logIn";
const searchUrl = "http://localhost:3000/perf/search";
const statsUrl = "http://localhost:3000/perf/getIntervalStats";
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
const sessionData = {};
let roomInfo = {};
let toolTip = null;
let uName = null;
let uToken = null;
let attempts = 0;
let savedParams = {};
let tableSpinner = null;
let chartSpinner = null;
let authSpinner = null;
let tableLoading = false;
let chartLoading = false;
let authenticating = false;

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

const tableSpinnerOptions = {
  lines: 15,
  length: 7,
  width: 3,
  radius: 10,
  scale: 1.0,
  corners: 0,
  opacity: 0.40,
  rotate: 0,
  direction: 1,
  speed: 1.7,
  trail: 58,
  top: "50%",
  left: "50%",
};

const chartSpinnerOptions = {
  lines: 17,
  length: 0,
  width: 9,
  radius: 84,
  scale: 1.0,
  corners: 0,
  opacity: 0.25,
  rotate: 0,
  direction: 1,
  speed: 1.7,
  trail: 68,
  top: `${(height / 2) + 25}px`,
  left: `${(width / 2) + 100}px`,
};

const authSpinnerOptions = {
  lines: 13,
  length: 0,
  width: 3,
  radius: 9,
  scale: 1.0,
  corners: 0,
  opacity: 0.50,
  rotate: 0,
  direction: 1,
  speed: 1.7,
  trail: 68,
};

function toggleSpinner(table) {
  const target = table ? $("#results")[0] : $("#gc")[0];
  let loading = false;
  if (table) {
    loading = tableLoading = !tableLoading;
  }
  else {
    loading = chartLoading = !chartLoading;
  }

  if (table && !tableSpinner) {
    tableSpinner = new Spinner(tableSpinnerOptions).spin(target);
  }
  else if (!table && !chartSpinner) {
    chartSpinner = new Spinner(chartSpinnerOptions).spin(target);
  }
  else {
    const spinner = table ? tableSpinner : chartSpinner;
    if (loading) {
      spinner.spin(target);
    }
    else {
      spinner.stop();
    }
  }
}

function toggleAuthSpinner() {
  const target = $(".modal-content")[0];
  authenticating = !authenticating;
  if (!authSpinner) {
    authSpinner = new Spinner(authSpinnerOptions).spin(target);
  }
  else {
    if (authenticating) {
      authSpinner.spin(target);
    }
    else {
      authSpinner.stop();
    }
  }
}

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

function refreshTable(pageIndex) {
  table.clear();
  if (sessionData.sessions) {
    sessionData.sessions.forEach(session => {
      if (!session || !session.userId) {
        table.row.add(["", "", "", "", "", "", ""]);
      }
      else {
        table.row.add([
          session.userId,
          session.deviceType,
          session.platform === 8 ? "iOS" : session.platform === 11 ? "Android" : "Unknown",
          session.startTime,
          session.id,
          session.roomDefId,
          session.buildType === 0 ? "Debug" : "Release",
        ]);
      }
    });
  }
 table.draw();
 table.page(pageIndex).draw(false);
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
      toggleAuthSpinner();
      $("#vText").addClass("error").html("Login Failed");
    }
    else {
      $("#vm").show();
    }
  }
  else {
    toggleAuthSpinner();
    $("#vText").removeClass("error").addClass("success").html("Success!");
    $("#vm").hide(1000);
    setUp();
  }
}

function updateAverages(bySelection) {
  let t = 0;
  let fa = 0;
  let ma = 0;
  if (bySelection) {
    // TODO
    const avgs = [];
    const selectedIds = table.rows({selected: true}).data().pluck(4);
    let i = 0;
    let j = 0;
    for (i; i < selectedIds.length; i++){
      for (j = 0; j < sessionData.sessions.length; j++){
        if (selectedIds[i] === sessionData.sessions[j].id) {
          avgs.push(sessionData.sessions[j]);
          break;
        }
      }
    }
    t = avgs.length;
    fa = t ? Math.floor(d3.mean(avgs, a => a.avgFps)) : 0;
    ma = t ? Math.floor(d3.mean(avgs, a => a.avgMem)) : 0;
  }
  else {
    t = sessionData.sessions.length;
    fa = t ? sessionData.avgFps : 0;
    ma = t ? sessionData.avgMem : 0;
  }

  if (bySelection) {
    $("#saCount").html(t);
    $("#saFps").html(fa);
    $("#saMem").html(ma);
	}
  else {
    $("#taCount").html(t);
    $("#taFps").html(fa);
    $("#taMem").html(ma);
  }
}

function getSuccess(data, status, j) {
  const dp = JSON.parse(data);
  const d = dp.results;
  sessionData.avgFps = d.avgFps;
  sessionData.avgMem = d.avgMem;
  sessionData.sessions = new Array(d.fullCount);
  sessionData.sessions.fill({});

  let curPage = 0;
  let idx = 0;
  for (let i = 0; i < d.pages.length; i++) {
    curPage = d.pages[i];
    for (let j = 0; j < d.pageLength; j++) {
      if (j + (i * d.pageLength) >= d.sessions.length) {
        break;
      }
      idx = j + (curPage * d.pageLength);
      sessionData.sessions[idx] = d.sessions[j + (i * d.pageLength)];
    }
  }

	if (sessionData) {
		refreshTable(table.page());
    updateAverages(false);
	}
}

function dataRequestCallback(wasSuccess, data, error, status) {
  toggleSpinner(false);
  if (wasSuccess) {
    graphData = JSON.parse(data).intervals.map(e => {
        e.ts = formatDate.parse(e.ts);
        return e;
      });
    updateChart();
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

  toggleAuthSpinner();

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

function handleSearch(newSearch) {
  if (newSearch || !savedParams) {
    savedParams = grabParams();
  }
  else {
    table.off("page");
  }

  const page = table.page();
  const pages = [];
  if (page > 0) {
    pages.push(page - 1);
  }
  pages.push(page);
  if (page < table.page.info().pages - 1) {
    pages.push(page + 1);
  }

	const jstr = JSON.stringify({
		"username": uName,
		"authToken": uToken,
		"params": {
      "constraints": {
        "pages": pages,
        "pageLength": table.page.len(),
        "user": savedParams.username,
        "deviceType": savedParams.deviceType,
        "platform": savedParams.platform,
        "buildType": savedParams.buildType,
        "buildVersion": savedParams.buildVersion,
        "startTime": savedParams.startTime,
        "endTime": savedParams.endTime,
        "roomDefId": savedParams.room,
      },
		},
  });

  toggleSpinner(true);
	$.ajax({
    "type": "POST",
    "url": searchUrl,
    "data": jstr,
  }).done((data, status, jqXHR) => {
    getSuccess(data, status, jqXHR);
    toggleSpinner(true);
    if (!newSearch) {
      table.on("page", () => handleSearch(false));
    }
  }).fail((jqXHR, textStatus, errorThrown) => {
    getFail(jqXHR, textStatus, errorThrown);
    toggleSpinner(true);
    if (!newSearch) {
      table.on("page", () => handleSearch(false));
    }
	});
}

function requestSessionData(id, user) {
  const jstr = JSON.stringify({
		"username": uName,
		"authToken": uToken,
		"params": {
        "sessionId": id,
		}});

  toggleSpinner(false);
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
  updateAverages(true);
}
function handleTableDeSelect(e, dt, type, indices) {
  updateAverages(true);
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
			handleSearch(true);
		});
    table = $("#results").DataTable({
        order: [],
        searching: false,
        select: true,
        lengthChange: false,
        pageLength: 10,
        processing: true,
    });

    table.on("select", handleTableSelect);
    table.on("deselect", handleTableDeSelect);
    table.on("page", () => {
      handleSearch(false);
    });

    $("#spinTest").on("click", () => {
      toggleSpinner(false);
    });

    authenticate(attempts);
});
