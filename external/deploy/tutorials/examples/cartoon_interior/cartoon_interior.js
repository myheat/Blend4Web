"use strict";

b4w.register("cartoon_interior", function(exports, require) {

var m_app    = require("app");
var m_cam    = require("camera");
var m_ctl    = require("controls");
var m_data   = require("data");
var m_main   = require("main");
var m_phy    = require("physics");
var m_scenes = require("scenes");
var m_trans  = require("transform");
var m_util   = require("util");

var m_quat = require("quat");

var GLOW_COLOR_VALID = [0, 1, 0];
var GLOW_COLOR_ERROR = [1, 0, 0];
var FLOOR_PLANE_NORMAL = [0, 1, 0];

var ROT_ANGLE = Math.PI/4;

var WALL_X_MAX = 4;
var WALL_X_MIN = -3.8;
var WALL_Z_MAX = 4.2;
var WALL_Z_MIN = -3.5;

var _obj_delta_xy = new Float32Array(2);
var spawner_pos = new Float32Array(3);
var _vec3_tmp = new Float32Array(3);
var _vec3_tmp2 = new Float32Array(3);
var _vec3_tmp3 = new Float32Array(3);
var _vec4_tmp = new Float32Array(4);

var _drag_mode = false;
var _enable_camera_controls = true;

var _selected_obj = null;

exports.init = function() {
    m_app.init({
        canvas_container_id: "canvas3d",
        callback: init_cb,
        physics_enabled: true,
        force_selectable: true,
        alpha: false,
        background_color: [1.0, 1.0, 1.0, 0.0]
    });
};

function init_cb(canvas_elem, success) {

    if (!success) {
        console.log("b4w init failure");
        return;
    }

    m_app.enable_controls(canvas_elem);

    canvas_elem.addEventListener("mousedown", main_canvas_down);
    canvas_elem.addEventListener("touchstart", main_canvas_down);

    canvas_elem.addEventListener("mouseup", main_canvas_up);
    canvas_elem.addEventListener("touchend", main_canvas_up);

    canvas_elem.addEventListener("mousemove", main_canvas_move);
    canvas_elem.addEventListener("touchmove", main_canvas_move);

    window.onresize = on_resize;
    on_resize();
    load();
}

function load() {
    m_data.load("blend_data/environment.json", load_cb);
}

function load_cb(data_id) {
    m_app.enable_camera_controls();
    init_controls();

    var spawner = m_scenes.get_object_by_name("spawner");
    m_trans.get_translation(spawner, spawner_pos);
}

function on_resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    m_main.resize(w, h);
}

function init_controls() {
    var controls_elem = document.getElementById("controls-container");
    controls_elem.style.display = "block";

    init_buttons();

    document.getElementById("load-1").addEventListener("click", function(e) {
        m_data.load("blend_data/bed.json", loaded_cb, null, null, true);
    });
    document.getElementById("load-2").addEventListener("click", function(e) {
        m_data.load("blend_data/chair.json", loaded_cb, null, null, true);
    });
    document.getElementById("load-3").addEventListener("click", function(e) {
        m_data.load("blend_data/commode_and_pot.json", loaded_cb, null, null, true);
    });
    document.getElementById("load-4").addEventListener("click", function(e) {
        m_data.load("blend_data/fan.json", loaded_cb, null, null, true);
    });
    document.getElementById("load-5").addEventListener("click", function(e) {
        m_data.load("blend_data/table.json", loaded_cb, null, null, true);
    });

    document.getElementById("delete").addEventListener("click", function(e) {
        if (_selected_obj) {
            var id = m_scenes.get_object_data_id(_selected_obj);
            m_data.unload(id);
            _selected_obj = null;
        }
    });
    document.getElementById("rot-ccw").addEventListener("click", function(e) {
        if (_selected_obj)
            rotate_object(_selected_obj, ROT_ANGLE);
    });
    document.getElementById("rot-cw").addEventListener("click", function(e) {
        if (_selected_obj)
            rotate_object(_selected_obj, -ROT_ANGLE);
    });
}

function init_buttons() {
    var ids = ["delete", "rot-ccw", "rot-cw"];

    for (var i = 0; i < ids.length; i++) {
        var id = ids[i];

        document.getElementById(id).addEventListener("mousedown", function(e) {
            var parent = e.target.parentNode;
            parent.classList.add("active");
        });
        document.getElementById(id).addEventListener("mouseup", function(e) {
            var parent = e.target.parentNode;
            parent.classList.remove("active");
        });
        document.getElementById(id).addEventListener("touchstart", function(e) {
            var parent = e.target.parentNode;
            parent.classList.add("active");
        });
        document.getElementById(id).addEventListener("touchend", function(e) {
            var parent = e.target.parentNode;
            parent.classList.remove("active");
        });
    }
}

function loaded_cb(data_id) {
    var cam = m_scenes.get_active_camera();

    if (m_ctl.check_sensor_manifold(cam, "COLLISION"))
        m_ctl.remove_sensor_manifold(cam, "COLLISION");

    var objs = m_scenes.get_all_objects();

    // spawn appended object in a certain position
    for (var i = 0; i < objs.length; i++) {
        var obj = objs[i];
        if (m_scenes.get_object_data_id(obj) == data_id) {
            if (m_phy.has_physics(obj)) {
                m_phy.enable_simulation(obj);
                m_trans.set_translation_v(obj, spawner_pos);
            }
            m_scenes.show_object(obj);
        }
    }

    // create sensors to detect collisions
    var sensors = [];
    for (var i = 0; i < objs.length; i++) {
        var obj = objs[i];
        if (m_phy.has_simulated_physics(obj)) {
            var sensor_col = m_ctl.create_collision_sensor(obj, "FURNITURE");
            var sensor_sel = m_ctl.create_selection_sensor(obj);

            if (obj == _selected_obj)
                sensor_sel.value = true;

            sensors.push(sensor_col);
            sensors.push(sensor_sel);
        }
    }

    var logic_func = function(s) {
        for (var i = 0; i < s.length; i+=2)
            if (s[i+1])
                return s[i];
        return 0;
    }

    m_ctl.create_sensor_manifold(cam, "COLLISION", m_ctl.CT_TRIGGER, sensors,
            logic_func, trigger_glow);
}

function trigger_glow(obj, id, pulse) {
    // change glow color according to collision status
    if (pulse == 1)
        m_scenes.set_glow_color(GLOW_COLOR_ERROR);
    else if (pulse == -1)
        m_scenes.set_glow_color(GLOW_COLOR_VALID);
}

function rotate_object(obj, angle) {
    var obj_quat = m_trans.get_rotation(obj, _vec4_tmp);
    m_quat.rotateY(obj_quat, angle, obj_quat);
    m_trans.set_rotation_v(obj, obj_quat);
    limit_object_position(obj);
}

function main_canvas_down(e) {
    _drag_mode = true;

    if (e.preventDefault)
        e.preventDefault();

    var x = get_coords_x(e);
    var y = get_coords_y(e);

    var obj = m_scenes.pick_object(x, y);

    // handling glow effect
    if (_selected_obj != obj) {
        if (_selected_obj)
            m_scenes.clear_glow_anim(_selected_obj);
        if (obj)
            m_scenes.apply_glow_anim(obj, 1, 1, 0);

        _selected_obj = obj;
    }

    // calculate delta in viewport coordinates
    if (_selected_obj) {
        var cam = m_scenes.get_active_camera();

        m_trans.get_translation(_selected_obj, _vec3_tmp);
        m_cam.project_point(cam, _vec3_tmp, _obj_delta_xy);

        _obj_delta_xy[0] = x - _obj_delta_xy[0];
        _obj_delta_xy[1] = y - _obj_delta_xy[1];
    }
}

function main_canvas_up(e) {
    _drag_mode = false;
    // enable camera controls after releasing an object
    if (!_enable_camera_controls) {
        m_app.enable_camera_controls();
        _enable_camera_controls = true;
    }
}

function main_canvas_move(e) {
    if (_drag_mode)
        if (_selected_obj) {
            // disable camera controls while moving an object
            if (_enable_camera_controls) {
                m_app.disable_camera_controls();
                _enable_camera_controls = false;
            }

            // calculate viewport coordinates
            var cam = m_scenes.get_active_camera();

            var x = get_coords_x(e);
            var y = get_coords_y(e);

            if (x >= 0 && y >= 0) {
                x -= _obj_delta_xy[0];
                y -= _obj_delta_xy[1];

                // emit ray from camera
                var camera_ray = m_cam.calc_ray(cam, x, y, _vec3_tmp);

                // calculate ray/floor_plane intersection point
                var cam_trans = m_trans.get_translation(cam, _vec3_tmp2);
                var point = m_util.line_plane_intersect(FLOOR_PLANE_NORMAL, 0,
                        cam_trans, camera_ray, _vec3_tmp3);

                // do not process parallel case and intersections behind the camera
                if (point && camera_ray[1] < 0) {
                    // move object to new position
                    m_trans.set_translation_v(_selected_obj, point);
                    limit_object_position(_selected_obj);
                }
            }
        }
}

function limit_object_position(obj) {
    var bb = m_trans.get_object_bounding_box(obj);
    var obj_pos = m_trans.get_translation(obj, _vec3_tmp);

    if (bb.max_x > WALL_X_MAX)
        obj_pos[0] -= bb.max_x - WALL_X_MAX;
    else if (bb.min_x < WALL_X_MIN)
        obj_pos[0] += WALL_X_MIN - bb.min_x;

    if (bb.max_z > WALL_Z_MAX)
        obj_pos[2] -= bb.max_z - WALL_Z_MAX;
    else if (bb.min_z < WALL_Z_MIN)
        obj_pos[2] += WALL_Z_MIN - bb.min_z;

    m_trans.set_translation_v(_selected_obj, obj_pos);
}

function get_coords_x(event) {
    return event.clientX || (event.touches && event.touches[0].pageX) || -1;
}

function get_coords_y(event) {
    return event.clientY || (event.touches && event.touches[0].pageY) || -1;
}

});

b4w.require("cartoon_interior").init();
