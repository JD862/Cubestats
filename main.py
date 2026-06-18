import streamlit as st
import pandas as pd

def simp(val):
    val = str(val)
    if "+" in val:
        return (float(val.strip("+")) + 2)
    elif "DNF" in val:
        return st.session_state.DNF
    else:
        return float(val)
    
def remv(lst):

    lst.sort()

    lst.pop(0)
    lst.pop(-1)

    return lst

def avg(lst):

    sum = 0
    for i in range (len(lst)):
        sum += lst[i]

    avg = sum / len(lst)
    return round(avg, 3)

def best_time(df):
    best_times = {}
    current_best = 10000

    for i in range (len(df) - 1):
        solve = df.iloc[i]
        solve_val = simp(solve["Time"])
        if solve_val == "DNF":
            solve_val = 100000
            

        if solve_val < current_best:
            best_times[int(solve["No."])] = float(solve_val)
            current_best = solve_val


    st.subheader("Best Times")

    df = pd.DataFrame(
    list(best_times.items()),
    columns=["x", "y"]
)

    df = df.sort_values("x")

    st.line_chart(df, x="x", y="y", height="content")

    #st.write(best_times)

        
def best_avg(df, num):
    best_times = {}
    current_best = 100

    for i in range (num ,len(df) - 1):
        solve_vals = []

        for j in range (num):
            solve = df.iloc[i - j]
            solve_vals.append(simp(solve["Time"]))

        solve_vals = remv(solve_vals)
        solve_val = avg(solve_vals)

        
        if solve_val < current_best:
            best_times[int(solve["No."] + num - 1)] = float(solve_val)
            current_best = solve_val


    st.subheader(f"Best Averages of {num}", text_alignment="center")

    df = pd.DataFrame(
    list(best_times.items()),
    columns=["x", "y"]
)

    df = df.sort_values("x")

    st.line_chart(df, x="x", y="y", x_label="No.", y_label="Times", height="content")

    #st.write(best_times)

def all_avg(df, num):
    times = {}

    for i in range (num ,len(df) - 1):
        solve_vals = []

        for j in range (num):
            solve = df.iloc[i - j]
            solve_vals.append(simp(solve["Time"]))

        solve_vals = remv(solve_vals)
        solve_val = avg(solve_vals)

        
        times[int(solve["No."] + num - 1)] = float(solve_val)


    st.subheader(f"All Averages of {num}", text_alignment="center")

    df = pd.DataFrame(
    list(times.items()),
    columns=["x", "y"]
)

    df = df.sort_values("x")

    st.line_chart(df, x="x", y="y", x_label="No.", y_label="Times", height="content")

    #st.write(times)

def main():
    st.title("Cubing Statistics")


    uploaded_file = st.file_uploader("Upload a CSV or Excel file", type=["csv", "xlsx"])

    if uploaded_file is not None:
        try:
            if uploaded_file.name.endswith('.csv'):
                df = pd.read_csv(uploaded_file)
            elif uploaded_file.name.endswith('.xlsx'):
                df = pd.read_excel(uploaded_file)
        except Exception as e:
            st.error(f"Error reading file: {e}")
    else:
        st.warning("Please upload a CSV or Excel file.")

    st.session_state.DNF = st.number_input("DNFs interpreted as:", 0)

    choice = st.multiselect("Which to display", [5, 12, 50, 100, 200, 500, 1000, 2000])

    with st.expander("Show Bests"):
        best_time(df)
        for i in range (len(choice)):
            best_avg(df, choice[i])

    with st.expander("Show Averages"):
        for i in range (len(choice)):
            all_avg(df, choice[i])


    





if __name__ == "__main__":
    main()