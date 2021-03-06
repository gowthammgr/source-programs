/*
Evaluator for language with booleans, conditionals,
sequences, functions, constants and blocks.

This is an evaluator for a language that lets you declare
functions, constants, apply functions, and
carry out simple arithmetic calculations, boolean operations.
This evaluator uses syntactic analysis, which is introduced
in SICP JS 4.1.7.

The covered Source §1 sublanguage is:

stmt    ::= const name = expr ;
         |  function name ( params ) block
         |  expr ; 
         |  stmt stmt
         |  return expr ;
         |  block
block   ::= { stmt }
params  ::=  | name ( , name )... 
expr    ::= number
         |  true | false 
	 |  null
	 |  string
         |  name
         |  expr binop expr
         |  unop expr
         |  expr ( exprs ) 
         |  ( params ) => expr
         |  ( params ) => block 
         |  expr ? expr : expr
         |  ( expression ) 
binop   ::= + | - | * | / | % | === | !==
         |  > | < | >= | <= 
unop    ::= ! | - 
exprs   ::=  | expression ( , expression )...
*/

/* CONSTANTS: NUMBERS, STRINGS, TRUE, FALSE */

// constants (numbers, strings, booleans)
// are considered "self_evaluating". This means, they
// represent themselves in the syntax tree
      
function is_self_evaluating(stmt) {
    return is_number(stmt) ||
           is_string(stmt) || 
           is_boolean(stmt);
}
   
// all other statements and expressions are
// tagged lists. Their tag tells us what
// kind of statement/expression they are

function is_tagged_list(stmt, the_tag) {
    return is_pair(stmt) && head(stmt) === the_tag;
}

function analyze_self_evaluating(stmt) {
    return env => stmt;
}

/* NAMES */

// In this evaluator, the operators are referred
// to as "names" in expressions.

// Names are tagged with "name".
// In this evaluator, typical names
// are 
// list("name", "+")
// list("name", "factorial")
// list("name", "n")

function is_name(stmt) {
    return is_tagged_list(stmt, "name");
}
function name_of_name(stmt) {
    return head(tail(stmt));
}

function analyze_name(stmt) {      
    return env => lookup_name_value(
                      name_of_name(stmt), env);
}

/* CONSTANT DECLARATIONS */

// constant declarations are tagged with "constant_declaration"
// and have "name" and "value" properties

function is_constant_declaration(stmt) {
   return is_tagged_list(stmt, "constant_declaration");
}
function constant_declaration_name(stmt) {
   return head(tail(head(tail(stmt))));
}
function constant_declaration_value(stmt) {
   return head(tail(tail(stmt)));
}
      
// evaluation of a constant declaration evaluates
// the right-hand expression and binds the
// name to the resulting value in the
// first (innermost) frame

function analyze_constant_declaration(stmt) {
    const name = constant_declaration_name(stmt);
    const vfun = analyze(constant_declaration_value(stmt));

    return env => {
                    set_name_value(name, vfun(env), env);
                    return undefined;
    };

}
    
/* CONDITIONAL EXPRESSIONS */

// conditional expressions are tagged
// with "conditional_expression"

function is_conditional_expression(stmt) {
   return is_tagged_list(stmt, 
                "conditional_expression");
}
function cond_expr_pred(stmt) {
   return list_ref(stmt, 1);
}
function cond_expr_cons(stmt) {
   return list_ref(stmt, 2);
}
function cond_expr_alt(stmt) {
   return list_ref(stmt, 3);
}
function is_true(x) {
    return x === true;
}

// the meta-circular evaluation of conditional expressions
// evaluates the predicate and then the appropriate
// branch, depending on whether the predicate evaluates to
// true or not
function analyze_conditional_expression(stmt) {
    const pfun = analyze(cond_expr_pred(stmt));
    const cfun = analyze(cond_expr_cons(stmt));
    const afun = analyze(cond_expr_alt(stmt));

    return env => is_true(pfun(env))
                  ? cfun(env)
                  : afun(env);
}

/* FUNCTION DEFINITION EXPRESSIONS */

// function definitions are tagged with "function_definition"
// have a list of "parameters" and a "body" statement

function is_function_definition(stmt) {
   return is_tagged_list(stmt, "function_definition");
}
function function_definition_parameters(stmt) {
   return head(tail(stmt));
}
function function_definition_body(stmt) {
   return head(tail(tail(stmt)));
}

// compound function values keep track of parameters, locals, body
// and environment, in a list tagged as "compound_function"

function make_compound_function(parameters, locals, body, env) {
    return list("compound_function",
                parameters, locals, body, env);
}
function is_compound_function(f) {
    return is_tagged_list(f, "compound_function");
}
function function_parameters(f) {
    return list_ref(f, 1);
}
function function_locals(f) {
    return list_ref(f, 2);
}
function function_body(f) {
    return list_ref(f, 3);
}
function function_environment(f) {
    return list_ref(f, 4);
}

// evaluating a function definition expression
// results in a function value. Note that the
// current environment is stored as the function
// value's environment

function analyze_function_definition(stmt) {
    const vars = function_definition_parameters(stmt);
    const locals = local_names(function_definition_body(stmt));
    const body_fun = analyze(function_definition_body(stmt));
    return env => make_compound_function(vars, locals, body_fun, env);
}

/* SEQUENCES */

// sequences of statements are just represented
// by tagged lists of statements by the parser.

function is_sequence(stmt) {
   return is_tagged_list(stmt, "sequence");
}
function make_sequence(stmts) {
   return list("sequence", stmts);
}
function sequence_statements(stmt) {   
   return head(tail(stmt));
}
function is_empty_sequence(stmts) {
   return is_null(stmts);
}
function first_statement(stmts) {
   return head(stmts);
}
function rest_statements(stmts) {
   return tail(stmts);
}

// to evaluate a sequence, we need to evaluate
// its statements one after the other, and return
// the value of the last statement. 
// An exception to this rule is when a return
// statement is encountered. In that case, the
// remaining statements are ignored and the 
// return value is the value of the sequence.

function analyze_sequence(stmts) {
    function sequentially(fun1, fun2) {
        return env => {
            const fun1_val = fun1(env);
            if (is_return_value(fun1_val)) {
                return fun1_val;
            } else {
                return fun2(env);
            }
        };
    }

    function loop(first_fun, rest_funs) {
        return is_null(rest_funs)
               ? first_fun
               : loop(sequentially(first_fun,
                          head(rest_funs)),
                      tail(rest_funs));         
    }

    const funs = map(analyze, stmts);
    return is_null(funs)
           ? env => undefined
           : loop(head(funs), tail(funs));
}

/* FUNCTION APPLICATION */

// The core of our evaluator is formed by the
// implementation of function applications.
// Applications are tagged with "application"
// and have "operator" and "operands"

function is_application(stmt) {
   return is_tagged_list(stmt, "application");
}
function operator(stmt) {
   return head(tail(stmt));
}
function operands(stmt) {
   return head(tail(tail(stmt)));
}
function no_operands(ops) {
   return is_null(ops);
}
function first_operand(ops) {
   return head(ops);
}
function rest_operands(ops) {
   return tail(ops);
}
      
// primitive functions are tagged with "primitive"      
// and come with a Source function "implementation"

function make_primitive_function(impl) {
    return list("primitive", impl);
}
function is_primitive_function(fun) {
   return is_tagged_list(fun, "primitive");
}
function primitive_implementation(fun) {
   return list_ref(fun, 1);
}

function analyze_application(stmt) {
    const function_func = analyze(operator(stmt));
    const arg_funcs = map(analyze, operands(stmt));
    return env => execute_application(function_func(env),
                      map(arg_func => arg_func(env), arg_funcs));
}

/* APPLY */
// function application needs to distinguish between
// primitive functions (which are evaluated using the
// underlying JavaScript), and compound functions.
// An application of the latter needs to evaluate the
// body of the function value with respect to an 
// environment that results from extending the function
// object's environment by a binding of the function
// parameters to the arguments and of local names to
// the special value no_value_yet

function execute_application(fun, args) {
    if (is_primitive_function(fun)) {
        return apply_primitive_function(fun, args);
    } else if (is_compound_function(fun)) {
        const body = function_body(fun);
        const locals = function_locals(fun);
        const names = insert_all(map(name_of_name, function_parameters(fun)),
                                 locals);
        const temp_values = map(x => no_value_yet, locals);
        const values = append(args, temp_values);
        const result = body(extend_environment(names, values, function_environment(fun)));
        
        if (is_return_value(result)) {
            return return_value_content(result);
        } else {
            return undefined;
        }

    } else {
        error(fun, "unknown function type in execute_application");
    }
}

// apply_in_underlying_javascript allows us
// to make use of JavaScript's primitive functions
// in order to access operators such as addition

function apply_primitive_function(fun, argument_list) {
    return apply_in_underlying_javascript(
                primitive_implementation(fun),
                argument_list);     
}

// We use a nullary function as temporary value for names whose
// declaration has not yet been evaluated. The purpose of the
// function definition is purely to create a unique identity;
// the function will never be applied and its return value 
// (null) is irrelevant.
const no_value_yet = () => null;

function insert_all(xs, ys) {
    return is_null(xs)
        ? ys
        : is_null(member(head(xs), ys))
          ? pair(head(xs), insert_all(tail(xs), ys))
          : error(head(xs), "multiple declarations of: ");
}

// The function local_names collects all names declared in the
// body statements. For a name to be included in the list of
// local_names, it needs to be declared outside of any other
// block or function.
function local_names(stmt) {
    if (is_sequence(stmt)) {
        const stmts = sequence_statements(stmt);
        return is_empty_sequence(stmts)
            ? null
            : insert_all(
                  local_names(first_statement(stmts)),
                  local_names(make_sequence(
		               rest_statements(stmts))));
    } else {
       return is_constant_declaration(stmt)
           ? list(constant_declaration_name(stmt))
           : null;
    }
}	     

/* RETURN STATEMENTS */

function is_return_statement(stmt) {
   return is_tagged_list(stmt, "return_statement");
}
function return_statement_expression(stmt) {
   return head(tail(stmt));
}
  
// since return statements can occur anywhere in the
// body, we need to identify them during the evaluation
// process

function make_return_value(content) {
    return list("return_value", content);
}
function is_return_value(value) {
    return is_tagged_list(value,"return_value");
}
function return_value_content(value) {
    return head(tail(value));
}

// return statements are evaluated by evaluating
// their sub-expression and then wrapping the result in a
// list
function analyze_return_statement(stmt) {
    const retval_func = analyze(return_statement_expression(stmt));
    return env => make_return_value(retval_func(env));
}

/* BLOCKS */

// blocks are tagged with "block"
function is_block(stmt) {
    return is_tagged_list(stmt, "block");
}
function make_block(stmt) {
   return list("block", stmt);
}
function block_body(stmt) {
    return head(tail(stmt));
}

// evaluation of blocks evaluates the body of the block
// with respect to the current environment extended by
// a binding of all local names to the special value
// no_value_yet

function analyze_block(stmt) {
    const body = block_body(stmt);
    const locals = local_names(body);	    
    const temp_values = map(x => no_value_yet,
                            locals);
    const body_func = analyze(body);

    return env => body_func(extend_environment(locals, temp_values, env));
}

/* ENVIRONMENTS */

// frames are pairs with a list of names as head
// an a list of pairs as tail (values). Each value 
// pair has the proper value as head and a flag
// as tail, which indicates whether assignment
// is allowed for the corresponding name

function make_frame(names, values) {
    return pair(names, values);
}
function frame_names(frame) {    
    return head(frame);
}
function frame_values(frame) {    
    return tail(frame);
}

// The first frame in an environment is the
// "innermost" frame. The tail operation
// takes you to the "enclosing" environment

function first_frame(env) {
   return head(env);
}
function enclosing_environment(env) {
   return tail(env);
}
function enclose_by(frame,env) {
   return pair(frame,env);
}
function is_empty_environment(env) {
   return is_null(env);
}

// set_name_value is used for let and const to give
// the initial value to the name in the first
// (innermost) frame of the given environment

function set_name_value(name, val, env) {
    function scan(names, vals) {
        return is_null(names)
            ? error("internal error: name not found")
            : name === head(names)
              ? set_head(head(vals), val)
              : scan(tail(names), tail(vals));
    } 
    const frame = first_frame(env);
    return scan(frame_names(frame),
                frame_values(frame));
}

// name lookup proceeds from the innermost
// frame and continues to look in enclosing
// environments until the name is found

function lookup_name_value(name, env) {
    function env_loop(env) {
        function scan(names, vals) {
            return is_null(names)
                   ? env_loop(
                       enclosing_environment(env))
                   : name === head(names)
                     ? head(head(vals))
                     : scan(tail(names), tail(vals));
        }
        if (is_empty_environment(env)) {
            error(name, "Unbound name: ");
        } else {
            const frame = first_frame(env);
            const value =  scan(frame_names(frame),
                                frame_values(frame));
	    if (value === no_value_yet) {
                error(name, "Name used before declaration: ");
            } else {
	        return value;
	    }
        }
    }
    return env_loop(env);
}

// applying a compound function to parameters will
// lead to the creation of a new environment, with
// respect to which the body of the function needs
// to be evaluated
// (also used for blocks)

function extend_environment(names, vals, base_env) {
    const is_variable = false; // Source 1 does not have variables
    if (length(names) === length(vals)) {
        return enclose_by(
                   make_frame(names, 
                      map(x => pair(x, is_variable), vals)),
                   base_env);
    } else if (length(names) < length(vals)) {
        error("Too many arguments supplied: " + 
              stringify(names) + ", " + 
              stringify(vals));
    } else {
        error("Too few arguments supplied: " + 
              stringify(names) + ", " + 
              stringify(vals));
    }
}

/* EVALUATE */

// The workhorse of our evaluator is the analyze function.
// It dispatches on the kind of statement at hand, and
// invokes the appropriate analysis. Analysing a statement / expression
// will return an execution function that accepts an environment
// and returns the value of the statement / expression.
function analyze(stmt) {
    return is_self_evaluating(stmt)
           ? analyze_self_evaluating(stmt)
         : is_name(stmt)
           ? analyze_name(stmt)
         : is_constant_declaration(stmt)
           ? analyze_constant_declaration(stmt)
         : is_conditional_expression(stmt)
           ? analyze_conditional_expression(stmt)
         : is_function_definition(stmt)
           ? analyze_function_definition(stmt)
         : is_sequence(stmt)
           ? analyze_sequence(sequence_statements(stmt))
         : is_block(stmt)
           ? analyze_block(stmt)
         : is_return_statement(stmt)
           ? analyze_return_statement(stmt)
         : is_application(stmt)
           ? analyze_application(stmt)
         : error(stmt, "Unknown statement type in analyze");
}

function evaluate(exp, env) {
    return (analyze(exp))(env);
}

// at the toplevel (outside of functions), return statements
// are not allowed. The function evaluate_toplevel detects
// return values and displays an error in when it encounters one.
// The program statement is wrapped in a block, to create the
// program environment.

function eval_toplevel(stmt) {
   // wrap program in block to create
   // program environment
   const program_block = make_block(stmt);
   const value = evaluate(program_block, 
                          the_global_environment);
   if (is_return_value(value)) {
       error("return not allowed " +
             "outside of function definitions");
   } else {
       return value;
   }
}

/* THE GLOBAL ENVIRONMENT */

const the_empty_environment = null;

// the minus operation is overloaded to
// support both binary minus and unary minus

function minus(x, y) {
    if (is_number(x) && is_number(y)) {
      return x - y;
    } else {
      return -x;
    }
}

// the global environment has bindings for all
// primitive functions, including the operators

const primitive_functions = list(
       list("display",       display         ),
       list("error",         error           ),
       list("+",             (x,y) => x + y  ),
       list("-",             (x,y) => minus(x, y)  ),
       list("*",             (x,y) => x * y  ),
       list("/",             (x,y) => x / y  ),
       list("%",             (x,y) => x % y  ),
       list("===",           (x,y) => x === y),
       list("!==",           (x,y) => x !== y),
       list("<",             (x,y) => x <   y),
       list("<=",            (x,y) => x <=  y),
       list(">",             (x,y) => x >   y),
       list(">=",            (x,y) => x >=  y),
       list("!",              x    =>   !   x)
       );

// the global environment also has bindings for all
// primitive non-function values, such as undefined and 
// math_PI

const primitive_constants = list(
       list("undefined", undefined),
       list("math_PI"  , math_PI)
      );
       
// setup_environment makes an environment that has
// one single frame, and adds a binding of all names
// listed as primitive_functions and primitive_values. 
// The values of primitive functions are "primitive" 
// objects, see line 281 how such functions are applied

function setup_environment() {
    const primitive_function_names =
        map(f => head(f), primitive_functions);
    const primitive_function_values =
        map(f => make_primitive_function(head(tail(f))),
            primitive_functions);
    const primitive_constant_names =
        map(f => head(f), primitive_constants);
    const primitive_constant_values =
        map(f => head(tail(f)),
            primitive_constants);
    return extend_environment(
               append(primitive_function_names, 
                      primitive_constant_names),
               append(primitive_function_values, 
                      primitive_constant_values),
               the_empty_environment);
}

const the_global_environment = setup_environment();

function parse_and_eval(str) {
    return eval_toplevel(parse(str));
}